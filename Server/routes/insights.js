const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Engagement = require('../models/Engagement');
const { parseRange, generateUtcBuckets } = require('../utils/insightsRange');

// GET /api/engagement/insights
// Query:
//   interval=day|week|month (default day)
//   rangeStart=2025-07-01
//   rangeEnd=2025-08-09
//   engagementTypes=view,click,join  (optional, default: all)
//   placeId=abc123                 (optional)
//   placeIds=abc123,def456         (optional, comma-separated)
//   targetType=promo               (optional)
//   targetId=685c05...             (optional)
router.get('/', verifyToken, async (req, res) => {
  try {
    const {
      interval = 'day',
      rangeStart,
      rangeEnd,
      engagementTypes,
      placeId,
      placeIds,
      targetType,
      targetId,
      // NEW (optional)
      groupBy,        // "place" (split series per place); omit for default behavior
      uniqueUsers     // "true" to count unique users instead of raw events
    } = req.query;

    const { start, end, unit } = parseRange({ rangeStart, rangeEnd, interval });

    // Build match
    const match = { timestamp: { $gte: start, $lte: end } };
    if (engagementTypes) {
      const types = engagementTypes.split(',').map(s => s.trim()).filter(Boolean);
      if (types.length) match.engagementType = { $in: types };
    }
    if (placeId) match.placeId = placeId;
    if (placeIds) {
      const arr = placeIds.split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) match.placeId = { $in: arr };
    }
    if (targetType) match.targetType = targetType;
    if (targetId) match.targetId = String(targetId);

    const useDistinct = String(uniqueUsers).toLowerCase() === 'true';

    // Build group key
    const groupKey = {
      bucket: { $dateTrunc: { date: "$timestamp", unit: unit, timezone: "UTC" } },
      engagementType: "$engagementType"
    };
    if (groupBy === 'place') groupKey.placeId = "$placeId";

    // Aggregation
    const pipeline = [
      { $match: match },
      useDistinct
        ? { $group: { _id: groupKey, users: { $addToSet: "$userId" } } }
        : { $group: { _id: groupKey, count: { $sum: 1 } } },
      {
        $project: useDistinct
          ? { _id: 0, bucket: "$_id.bucket", engagementType: "$_id.engagementType", placeId: "$_id.placeId", count: { $size: "$users" } }
          : { _id: 0, bucket: "$_id.bucket", engagementType: "$_id.engagementType", placeId: "$_id.placeId", count: 1 }
      },
      { $sort: { bucket: 1 } }
    ];

    const rows = await Engagement.aggregate(pipeline).allowDiskUse(true);

    // Build zero-filled series
    const bucketKeys = generateUtcBuckets(start, end, unit);

    const keyOf = (r) => groupBy === 'place'
      ? `${r.engagementType}::${r.placeId || 'unknown'}`
      : r.engagementType;

    const labelOf = (k) => {
      if (groupBy !== 'place') return k; // just the engagementType
      const [etype, pid] = k.split('::');
      return `${etype} — ${pid || 'unknown'}`;
    };

    const explicitTypes = new Set(
      engagementTypes ? engagementTypes.split(',').map(s => s.trim()).filter(Boolean) : []
    );

    // Seed with explicit types so they appear even if zero
    const seriesMap = new Map();
    const ensureSeries = (k) => {
      if (!seriesMap.has(k)) {
        seriesMap.set(k, { name: labelOf(k), points: bucketKeys.map(ts => ({ t: ts, value: 0 })) });
      }
    };

    if (groupBy === 'place') {
      // With groupBy=place we only know exact keys from data; seed by type only for placeholder
      for (const t of explicitTypes) ensureSeries(`${t}::__placeholder__`); // will be replaced by real place keys as they appear
    } else {
      // Default behavior: per engagementType
      const typesSeen = new Set(rows.map(r => r.engagementType));
      const allTypes = new Set([...typesSeen, ...explicitTypes]);
      for (const t of allTypes) ensureSeries(t);
    }

    // Materialize series keys from data
    for (const r of rows) ensureSeries(keyOf(r));

    const indexByBucket = Object.fromEntries(bucketKeys.map((k,i)=>[k,i]));
    for (const r of rows) {
      const ts = new Date(r.bucket).toISOString();
      const k = keyOf(r);
      const s = seriesMap.get(k);
      const bi = indexByBucket[ts];
      if (s && bi !== undefined) s.points[bi].value = r.count;
    }

    const series = [...seriesMap.values()];
    const totals = Object.fromEntries(series.map(s => [s.name, s.points.reduce((sum,p)=>sum+p.value,0)]));

    res.json({
      range: { start: start.toISOString(), end: end.toISOString(), interval: unit },
      mode: useDistinct ? 'uniqueUsers' : 'events',
      groupedBy: groupBy || 'engagementType',
      series,
      totals
    });
  } catch (err) {
    console.error('❌ Insights error:', err);
    res.status(500).json({ message: 'Server error building insights' });
  }
});

module.exports = router;
