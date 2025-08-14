const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Engagement = require('../models/Engagement');
const { parseRange, generateUtcBuckets } = require('../utils/insightsRange');

const MS_DAY = 24 * 60 * 60 * 1000;

router.get('/', verifyToken, async (req, res) => {
  try {
    let {
      interval = 'day',
      rangeStart,
      rangeEnd,
      engagementTypes,
      placeId,
      placeIds,
      targetType,
      targetId,
      targetIds,
      eventIds,
      promotionIds,
      groupBy,
      uniqueUsers,
      compare, // optional: "true" to include previous period series/totals
    } = req.query;

    // Back-compat
    rangeStart = rangeStart || req.query.start;
    rangeEnd   = rangeEnd   || req.query.end;

    const useDistinct = String(uniqueUsers).toLowerCase() === 'true';
    const includeCompare = String(compare).toLowerCase() === 'true';

    const csvToArr = (csv) => csv?.split(',').map(s => s.trim()).filter(Boolean) || [];

    // Build match WITHOUT time for bounds probing and re-use
    const matchNoTime = {};
    if (engagementTypes) {
      const types = csvToArr(engagementTypes);
      if (types.length) matchNoTime.engagementType = { $in: types };
    }
    if (placeId) matchNoTime.placeId = placeId;
    if (placeIds) {
      const arr = csvToArr(placeIds);
      if (arr.length) matchNoTime.placeId = { $in: arr };
    }
    if (targetType) matchNoTime.targetType = targetType;
    if (targetId) matchNoTime.targetId = String(targetId);
    const allTargetIds = [
      ...csvToArr(targetIds),
      ...csvToArr(eventIds),
      ...csvToArr(promotionIds),
    ];
    if (allTargetIds.length) matchNoTime.targetId = { $in: allTargetIds };

    // Derive start/end/unit (aligned to bucket boundaries)
    let range = null;
    if (rangeStart || rangeEnd) {
      range = parseRange({ rangeStart, rangeEnd, interval });
    } else {
      // Discover dataset bounds for current filters
      const [bounds] = await Engagement.aggregate([
        { $match: matchNoTime },
        { $group: { _id: null, min: { $min: '$timestamp' }, max: { $max: '$timestamp' } } },
      ]).allowDiskUse(true);

      if (!bounds?.min || !bounds?.max) {
        return res.json({
          range: { start: null, end: null, interval },
          mode: useDistinct ? 'uniqueUsers' : 'events',
          groupedBy: (groupBy || 'engagementType').toLowerCase(),
          series: [],
          totals: { view: 0, click: 0, join: 0 },
          // compare fields omitted when no data
        });
      }

      range = parseRange({
        rangeStart: bounds.min.toISOString().slice(0, 10),
        rangeEnd:   bounds.max.toISOString().slice(0, 10),
        interval,
      });
    }

    let { start, end, unit } = range;

    // Auto-promote granularity for large spans
    const spanDays = Math.max(1, Math.ceil((end - start) / MS_DAY) + 1);
    if (unit === 'day' && spanDays > 370) {
      interval = 'week';
      ({ start, end, unit } = parseRange({
        rangeStart: start.toISOString().slice(0, 10),
        rangeEnd:   end.toISOString().slice(0, 10),
        interval,
      }));
    } else if (unit === 'week' && spanDays > 5 * 365) {
      interval = 'month';
      ({ start, end, unit } = parseRange({
        rangeStart: start.toISOString().slice(0, 10),
        rangeEnd:   end.toISOString().slice(0, 10),
        interval,
      }));
    }

    // Time-bounded match
    const match = { ...matchNoTime, timestamp: { $gte: start, $lte: end } };

    // Normalize groupBy
    const gb = (groupBy || '').toLowerCase();
    const groupByMode =
      gb === 'place' ? 'place'
      : gb === 'target' || gb === 'event' || gb === 'promotion' ? 'target'
      : 'engagementType';

    // $dateTrunc aligned with utils: week starts Monday, UTC
    const truncSpec = (unit === 'week')
      ? { date: '$timestamp', unit, timezone: 'UTC', startOfWeek: 'monday' }
      : { date: '$timestamp', unit, timezone: 'UTC' };

    // Group key builder
    const buildGroupKey = () => {
      const gk = {
        bucket: { $dateTrunc: truncSpec },
        engagementType: '$engagementType',
      };
      if (groupByMode === 'place')  gk.placeId  = '$placeId';
      if (groupByMode === 'target') gk.targetId = '$targetId';
      return gk;
    };

    // Pipeline builder (current/previous share structure)
    const buildPipeline = (timeMatch) => ([
      { $match: timeMatch },
      useDistinct
        ? { $group: { _id: buildGroupKey(), users: { $addToSet: '$userId' } } }
        : { $group: { _id: buildGroupKey(), count: { $sum: 1 } } },
      {
        $project: useDistinct
          ? {
              _id: 0,
              bucket: '$_id.bucket',
              engagementType: '$_id.engagementType',
              placeId: '$_id.placeId',
              targetId: '$_id.targetId',
              count: { $size: '$users' },
            }
          : {
              _id: 0,
              bucket: '$_id.bucket',
              engagementType: '$_id.engagementType',
              placeId: '$_id.placeId',
              targetId: '$_id.targetId',
              count: 1,
            },
      },
      { $sort: { bucket: 1 } },
    ]);

    // Run current aggregation
    const rows = await Engagement.aggregate(buildPipeline(match)).allowDiskUse(true);

    // ---- Helpers for shaping to series ----
    const bucketKeys = generateUtcBuckets(start, end, unit);
    const indexByBucket = Object.fromEntries(bucketKeys.map((k, i) => [k, i]));

    const keyOf = (r) => {
      if (groupByMode === 'place')  return `${r.engagementType}::place::${r.placeId || 'unknown'}`;
      if (groupByMode === 'target') return `${r.engagementType}::target::${r.targetId || 'unknown'}`;
      return r.engagementType;
    };
    const labelOf = (k) => {
      const [etype, scope, id] = k.split('::');
      if (scope === 'place')  return `${etype} — ${id}`;
      if (scope === 'target') return `${etype} — ${id}`;
      return etype;
    };

    const explicitTypes = new Set(csvToArr(engagementTypes));
    const seriesMap = new Map();

    const ensureSeries = (k) => {
      if (!seriesMap.has(k)) {
        seriesMap.set(k, {
          name: labelOf(k),
          points: bucketKeys.map(ts => ({ t: ts, value: 0 })),
        });
      }
    };

    // Seed series for explicit engagement types when grouping by type
    if (groupByMode === 'engagementType') {
      const seen = new Set(rows.map(r => r.engagementType));
      const allTypes = new Set([...seen, ...explicitTypes]);
      for (const t of allTypes) ensureSeries(t);
    }

    // Ensure series for all row keys
    for (const r of rows) ensureSeries(keyOf(r));

    // Fill series points
    for (const r of rows) {
      const ts = new Date(r.bucket).toISOString();
      const sKey = keyOf(r);
      const s = seriesMap.get(sKey);
      const idx = indexByBucket[ts];
      if (s && idx !== undefined) s.points[idx].value = r.count;
    }

    const series = [...seriesMap.values()];

    // Totals by engagement type (stable keys for frontend KPIs)
    const totals = { view: 0, click: 0, join: 0 };
    for (const r of rows) {
      const k = String(r.engagementType || '').toLowerCase();
      if (k === 'view' || k === 'click' || k === 'join') totals[k] += (r.count || 0);
    }

    // ----------------- Previous Period (optional) -----------------
    let prevTotals, prevSeries, prevSeriesAligned, prevRange;
    if (includeCompare) {
      const spanMs   = end.getTime() - start.getTime();
      const prevEnd  = new Date(start.getTime() - 1);
      const prevStart= new Date(prevEnd.getTime() - spanMs);
      prevRange = { start: prevStart, end: prevEnd };

      const matchPrev = { ...matchNoTime, timestamp: { $gte: prevStart, $lte: prevEnd } };

      const prevRows = await Engagement.aggregate(buildPipeline(matchPrev)).allowDiskUse(true);

      const prevBucketKeys = generateUtcBuckets(prevStart, prevEnd, unit);
      const prevIndexByBucket = Object.fromEntries(prevBucketKeys.map((k, i) => [k, i]));

      const prevKeyOf = (r) => {
        if (groupByMode === 'place')  return `${r.engagementType}::place::${r.placeId || 'unknown'}`;
        if (groupByMode === 'target') return `${r.engagementType}::target::${r.targetId || 'unknown'}`;
        return r.engagementType;
      };
      const prevLabelOf = (k) => {
        const [etype, scope, id] = k.split('::');
        if (scope === 'place')  return `${etype} — ${id}`;
        if (scope === 'target') return `${etype} — ${id}`;
        return etype;
      };

      const prevSeriesMap = new Map();

      const ensurePrevSeries = (k) => {
        if (!prevSeriesMap.has(k)) {
          prevSeriesMap.set(k, {
            name: prevLabelOf(k) + ' (prev)',
            points: prevBucketKeys.map(ts => ({ t: ts, value: 0 })),
          });
        }
      };

      if (groupByMode === 'engagementType') {
        const seenPrev = new Set(prevRows.map(r => r.engagementType));
        const allTypesPrev = new Set([...seenPrev, ...explicitTypes]);
        for (const t of allTypesPrev) ensurePrevSeries(t);
      }

      for (const r of prevRows) ensurePrevSeries(prevKeyOf(r));

      for (const r of prevRows) {
        const ts = new Date(r.bucket).toISOString();
        const sKey = prevKeyOf(r);
        const s = prevSeriesMap.get(sKey);
        const idx = prevIndexByBucket[ts];
        if (s && idx !== undefined) s.points[idx].value = r.count;
      }

      prevSeries = [...prevSeriesMap.values()];

      // Aligned previous series for overlay on current x-axis
      const offsetMs = start.getTime() - prevStart.getTime();
      prevSeriesAligned = prevSeries.map(s => ({
        name: s.name, // keep "(prev)" suffix; your client can style dashed/opacity
        points: s.points.map(p => ({
          t: new Date(new Date(p.t).getTime() + offsetMs).toISOString(),
          value: p.value,
        })),
      }));

      // Previous totals by engagement type
      prevTotals = { view: 0, click: 0, join: 0 };
      for (const r of prevRows) {
        const key = String(r.engagementType || '').toLowerCase();
        if (key === 'view' || key === 'click' || key === 'join') {
          prevTotals[key] += (r.count || 0);
        }
      }
    }

    // ----------------- Response -----------------
    res.json({
      range: { start: start.toISOString(), end: end.toISOString(), interval: unit },
      ...(includeCompare && prevRange ? {
        prevRange: { start: prevRange.start.toISOString(), end: prevRange.end.toISOString() }
      } : {}),
      mode: useDistinct ? 'uniqueUsers' : 'events',
      groupedBy: groupByMode,
      series,               // current period series
      ...(includeCompare ? { prevSeries, prevSeriesAligned } : {}),
      totals,               // { view, click, join } for KPIs
      ...(includeCompare ? { prevTotals } : {}),
    });
  } catch (err) {
    console.error('❌ Insights error:', err);
    res.status(500).json({ message: 'Server error building insights' });
  }
});

module.exports = router;
