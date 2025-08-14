import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Dimensions, StyleSheet, ActivityIndicator, ScrollView, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import { fetchBusinessInsights, selectInsights, selectInsightsLoading, selectInsightsError } from '../../Slices/InsightsSlice';
import { selectEvents } from '../../Slices/EventsSlice';
import { selectPromotions } from '../../Slices/PromotionsSlice';
import InsightsModeToggle from './InsightsModeToggle';
import SelectorChips from './SelectorChips';
import ChartsSection from './ChartsSection';
import { buildLineData, buildPieData } from '../../utils/Insights/insightsTransforms';
import IntervalToggle from './IntervalToggle';
import DateRangePicker from './DateRangePicker';
import { toYMD } from '../../utils/Insights/dateRanges';
import { SERIES_COLORS, prettySeriesLabel, colorFor, useStableCsv } from '../../utils/Insights/helpers';
import { useDateRangeState, useIntervalGuard, useActiveSeries } from '../../utils/Insights/hooks';
import { computeKpis } from '../../utils/Insights/insightsMath';
import InsightsSummaryBar from './InsightsSummaryBar';
import InsightsDetailsSheet from './InsightsDetailsSheet';

const screenWidth = Dimensions.get('window').width;

export default function Insights() {
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const businessData = user?.businessDetails || {};

  const insights = useSelector(selectInsights);
  const loading = useSelector(selectInsightsLoading);
  const error = useSelector(selectInsightsError);

  const events = useSelector(selectEvents, shallowEqual) || [];
  const promotions = useSelector(selectPromotions, shallowEqual) || [];

  const [viewMode, setViewMode] = useState('business');
  const [selectedEventIds, setSelectedEventIds] = useState([]);
  const [selectedPromotionIds, setSelectedPromotionIds] = useState([]);
  const [interval, setInterval] = useState('day');
  const [dateRange, setDateRange] = useState({ preset: '30d', startDate: null, endDate: null });
  const [showFilters, setShowFilters] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // derived date values
  const { startDateISO, endDateISO, startObj, endObj } = useDateRangeState(dateRange);
  const disabledIntervals = useIntervalGuard(dateRange.preset, startObj, endObj, interval, setInterval);
  const { current, previous, kpis } = useMemo(() => computeKpis(insights), [
    insights?.totals,
    insights?.series,
    insights?.prevTotals,
    insights?.previousTotals,
  ]);

  const singlePlaceId = user?.placeId || businessData?.placeId;
  const multiPlaceIds = useMemo(
    () => (businessData?.locations || []).map((l) => l?.placeId).filter(Boolean),
    [businessData?.locations]
  );

  const toggleFilters = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters((s) => !s);
  };

  const rangeLabel = useMemo(() => {
    // compact range label e.g. "Last 30D" or "Aug 1–Aug 30"
    if (dateRange.preset !== 'custom') return dateRange.preset.toUpperCase();
    if (startObj && endObj) {
      const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
      return `${fmt(startObj)}–${fmt(endObj)}`;
    }
    return 'Custom';
  }, [dateRange, startObj, endObj]);

  const contextLabel = useMemo(() => {
    if (viewMode === 'event') {
      const id = selectedEventIds?.[0];
      const ev = (events || []).find((e) => e._id === id);
      return ev?.title || 'Select event';
    }
    if (viewMode === 'promotion') {
      const id = selectedPromotionIds?.[0];
      const pr = (promotions || []).find((p) => p._id === id);
      return pr?.title || 'Select promotion';
    }
    return 'Business';
  }, [viewMode, selectedEventIds, selectedPromotionIds, events, promotions]);

  // coerce single-select & clear opposite selection on mode change
  useEffect(() => {
    if (viewMode === 'event') {
      setSelectedPromotionIds([]);
      setSelectedEventIds((ids) => (ids.length > 1 ? [ids[0]] : ids));
    } else if (viewMode === 'promotion') {
      setSelectedEventIds([]);
      setSelectedPromotionIds((ids) => (ids.length > 1 ? [ids[0]] : ids));
    }
  }, [viewMode]);

  // series visibility
  const series = insights?.series || [];
  const [activeSeries, toggleSeries] = useActiveSeries(series);

  // assemble params once
  const csvEventIds = useStableCsv(selectedEventIds);
  const csvPromoIds = useStableCsv(selectedPromotionIds);
  const csvPlaceIds = useStableCsv(multiPlaceIds);

  const params = useMemo(() => {
    // guard rails per mode
    if (viewMode === 'event' && !csvEventIds) return null;
    if (viewMode === 'promotion' && !csvPromoIds) return null;
    if (viewMode === 'business' && !singlePlaceId && !csvPlaceIds) return null;

    const base = {
      interval,
      engagementTypes: 'view,click,join',
      uniqueUsers: 'true',
      compare: 'true',
    };

    if (startDateISO) base.rangeStart = toYMD(startDateISO);
    if (endDateISO) base.rangeEnd = toYMD(endDateISO);

    if (viewMode === 'business') {
      if (singlePlaceId) base.placeId = singlePlaceId;
      else base.placeIds = csvPlaceIds;
    } else if (viewMode === 'event') {
      base.targetType = 'event';
      base.eventIds = csvEventIds;
    } else {
      base.targetType = 'promo';
      base.promotionIds = csvPromoIds;
    }

    return base;
  }, [viewMode, interval, startDateISO, endDateISO, csvEventIds, csvPromoIds, csvPlaceIds, singlePlaceId]);

  // fetch effect
  useEffect(() => {
    if (params) dispatch(fetchBusinessInsights(params));
  }, [dispatch, params]);

  // chart data (single place to compute x-axis from first series)
  const baseDates = useMemo(() => {
    const pts = series[0]?.points || [];
    return pts.map((p) => p.t);
  }, [series]);

  const rawLineData = useMemo(
    () => buildLineData(series, activeSeries, screenWidth, { interval }),
    [series, activeSeries, interval]
  );

  const coloredLineData = useMemo(() => {
    if (!rawLineData?.datasets?.length) {
      return rawLineData || { labels: [], datasets: [], legends: [] };
    }

    const legends = rawLineData.legends || [];

    const datasets = rawLineData.datasets.map((ds, i) => {
      const name = legends[i] || '';
      const isPrev = name.toLowerCase().includes('(prev)');
      const baseName = name.replace(/\s*\(prev\)$/i, '');
      return {
        ...ds,
        color: () => (isPrev ? 'rgba(59,130,246,0.35)' : colorFor(baseName)),
        strokeDashArray: isPrev ? [6, 4] : undefined,
        opacity: isPrev ? 0.5 : 1,
      };
    });

    const prettyLegends = legends.map(prettySeriesLabel);
    return { ...rawLineData, datasets, legends: prettyLegends };
  }, [rawLineData]);

  const pieData = useMemo(() => {
    const totals = insights?.totals;
    return buildPieData(totals, prettySeriesLabel, colorFor) || [];
  }, [insights?.totals]);

  const chartTitle = useMemo(() => {
    const baseTitle = insights?.mode === 'uniqueUsers' ? 'Unique users over time' : 'Events over time';
    return baseTitle + (viewMode === 'event' ? ' (by event)' : viewMode === 'promotion' ? ' (by promotion)' : '');
  }, [insights?.mode, viewMode]);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerWrap}>
          <View style={styles.controlsCard}>
            {/* Card header */}
            <View style={styles.cardHeader}>
              <View style={styles.cardGrip} />
              <Text style={styles.cardTitle}>Insights filters</Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {`View: ${viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}  •  Interval: ${interval.toUpperCase()}  •  Range: ${rangeLabel}  •  Context: ${contextLabel}`}
              </Text>
            </View>
            {/* Row 1: Mode + Interval */}
            <View style={styles.row}>
              <View style={[styles.cell, styles.grow]}>
                <Text style={styles.label}>View</Text>
                <InsightsModeToggle
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { key: 'business', label: 'Business' },
                    { key: 'event', label: 'Event' },
                    { key: 'promotion', label: 'Promotion' },
                  ]}
                />
              </View>
            </View>
            {/* Row 3: Conditional selectors */}
            {viewMode === 'event' && (
              <View style={styles.row}>
                <View style={[styles.cell, styles.grow]}>
                  <Text style={styles.label}>Event</Text>
                  <View style={styles.selectorWell}>
                    <SelectorChips
                      items={events}
                      selectedIds={selectedEventIds}
                      setSelectedIds={setSelectedEventIds}
                      selectionMode="single"
                      allowDeselect={false}
                      emptyText="No events found for this business."
                    />
                  </View>
                </View>
              </View>
            )}
            {viewMode === 'promotion' && (
              <View style={styles.row}>
                <View style={[styles.cell, styles.grow]}>
                  <Text style={styles.label}>Promotion</Text>
                  <View style={styles.selectorWell}>
                    <SelectorChips
                      items={promotions}
                      selectedIds={selectedPromotionIds}
                      setSelectedIds={setSelectedPromotionIds}
                      selectionMode="single"
                      allowDeselect
                      emptyText="No promotions found for this business."
                    />
                  </View>
                </View>
              </View>
            )}
            {/* Summary + More Filters toggle */}
            <View style={[styles.row, { alignItems: 'center', marginTop: 10 }]}>
              <View style={{ flex: 1 }} />
              <Pressable onPress={toggleFilters} style={styles.moreBtn} hitSlop={8}>
                <Text style={styles.moreBtnText}>{showFilters ? 'Hide filters' : 'More filters'}</Text>
              </Pressable>
            </View>
            {showFilters && (
              <>
                {/* Row 2: Interval */}
                <View style={styles.row}>
                  <View style={[styles.cell, styles.grow]}>
                    <Text style={styles.label}>Interval</Text>
                    <IntervalToggle value={interval} onChange={setInterval} disabledKeys={disabledIntervals} />
                  </View>
                </View>
                {/* Row 3: Date Range */}
                <View style={styles.row}>
                  <View style={[styles.cell, styles.grow]}>
                    <Text style={styles.label}>Date range</Text>
                    <DateRangePicker value={dateRange} onChange={setDateRange} />
                  </View>
                </View>
              </>
            )}
          </View>
        </View>
        <View style={{ paddingHorizontal: 12, marginTop: 8 }}>
          <InsightsSummaryBar
            kpis={kpis}
            loading={loading}
            onOpenDetails={() => setDetailsOpen(true)}
          />
        </View>
        {/* Body */}
        <View style={styles.container}>
          {loading && <ActivityIndicator size="large" style={{ marginTop: 8 }} />}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <ChartsSection
              chartTitle={chartTitle}
              series={series}
              activeMap={activeSeries}
              onToggleSeries={toggleSeries}
              getSeriesLabel={(s) => prettySeriesLabel(s.name)}
              lineData={coloredLineData || { labels: [], datasets: [], legends: [] }}
              baseDates={baseDates}
              pieData={pieData}
              range={insights?.range}
              screenWidth={screenWidth}
              SERIES_COLORS={SERIES_COLORS}
              styles={styles}
            />
          )}
        </View>
      </ScrollView>
      <InsightsDetailsSheet
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        insights={insights}
        loading={loading}
        kpis={kpis}
        views={current.views}
        clicks={current.clicks}
        joins={current.joins}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FAFAFA', paddingTop: 130 },
  content: { paddingBottom: 24 },
  headerWrap: {
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    zIndex: 10,
  },
  controlsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  cardGrip: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cardSubtitle: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  selectorWell: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEF2F7',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 8,
  },
  summaryText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  moreBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  moreBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  spacer: { width: 12 },
  cell: {
    minWidth: 140,
  },
  grow: { flex: 1 },
  label: { fontSize: 12, color: '#6B7280', marginBottom: 6, fontWeight: '600' },
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 120,
  },
  chartTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 10, textAlign: 'left' },
  errorText: { color: '#d00', textAlign: 'center', marginTop: 8 },
  meta: { color: '#666', textAlign: 'center', marginTop: 10 },
});
