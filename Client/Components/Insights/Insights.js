import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import {
  fetchBusinessInsights,
  selectInsights,
  selectInsightsLoading,
  selectInsightsError,
} from '../../Slices/InsightsSlice';
import { selectEvents } from '../../Slices/EventsSlice';
import { selectPromotions } from '../../Slices/PromotionsSlice';
import InsightsModeToggle from './InsightsModeToggle';
import SelectorChips from './SelectorChips';
import ChartsSection from './ChartsSection';
import { buildLineData, buildPieData } from '../../utils/Insights/insightsTransforms';

const screenWidth = Dimensions.get('window').width;

const PIE_PALETTE = [
  'rgba(54,162,235,0.7)',
  'rgba(255,99,132,0.7)',
  'rgba(255,206,86,0.7)',
  'rgba(75,192,192,0.7)',
  'rgba(153,102,255,0.7)',
  'rgba(255,159,64,0.7)',
];

export default function Insights() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const businessData = user?.businessDetails || {};
  const insights = useSelector(selectInsights);
  const loading = useSelector(selectInsightsLoading);
  const error = useSelector(selectInsightsError);
  const [viewMode, setViewMode] = useState('business'); // 'business' | 'event' | 'promotion'
  const [selectedEventIds, setSelectedEventIds] = useState([]);
  const [selectedPromotionIds, setSelectedPromotionIds] = useState([]);
  const [activeSeries, setActiveSeries] = useState({});
  const events = useSelector(selectEvents, shallowEqual) || [];
  const promotions = useSelector(selectPromotions, shallowEqual) || [];

  // Init series toggle whenever data changes
  useEffect(() => {
    if (!insights?.series?.length) return;
    const next = {};
    for (const s of insights.series) next[s.name] = true;
    setActiveSeries(next);
  }, [insights?.series]);

  // Fetch insights when context/mode/selection changes
  useEffect(() => {
    const singlePlaceId = user?.placeId || businessData?.placeId;
    const multiPlaceIds =
      businessData?.locations?.map((l) => l?.placeId).filter(Boolean) || [];

    // guard rails based on mode
    if (viewMode === 'event' && selectedEventIds.length === 0) return;
    if (viewMode === 'promotion' && selectedPromotionIds.length === 0) return;
    if (
      viewMode === 'business' &&
      !singlePlaceId &&
      !(multiPlaceIds && multiPlaceIds.length)
    )
      return;

    const params = {
      interval: 'day',
      engagementTypes: 'view,click,join',
      uniqueUsers: 'true',
    };

    if (viewMode === 'business') {
      if (singlePlaceId) {
        params.placeId = singlePlaceId;
      } else {
        params.placeIds = multiPlaceIds.join(',');
        params.groupBy = 'place';
      }
    } else if (viewMode === 'event') {
      params.groupBy = 'event';
      params.eventIds = selectedEventIds.join(',');
    } else {
      params.groupBy = 'promotion';
      params.promotionIds = selectedPromotionIds.join(',');
    }

    dispatch(fetchBusinessInsights(params));
  }, [
    dispatch,
    viewMode,
    selectedEventIds.join(','),
    selectedPromotionIds.join(','),
    user?.placeId,
    businessData?.placeId,
    businessData?.locations,
  ]);

  useEffect(() => {
    if (viewMode === 'event') setSelectedPromotionIds([]);
    if (viewMode === 'promotion') setSelectedEventIds([]);
  }, [viewMode]);

  // For tooltips: keep unformatted date array from the first series
  const base = useMemo(() => {
    if (!insights?.series?.length) return null;
    const pts = insights.series[0].points || [];
    return { allDates: pts.map((p) => p.t) };
  }, [insights]);

  // Helper: map series/totals names to human titles in event/promotion modes
  const nameFor = useCallback(
    (name) => {
      if (viewMode === 'event') {
        const ev = events.find((e) => e._id === name);
        return ev?.title || ev?.name || name;
      }
      if (viewMode === 'promotion') {
        const pr = promotions.find((p) => p._id === name);
        return pr?.title || pr?.name || name;
      }
      return name;
    },
    [viewMode, events, promotions]
  );

  const lineData = useMemo(() => buildLineData(insights?.series, activeSeries, screenWidth), [insights?.series, activeSeries]);
  const pieData = useMemo(() => buildPieData(insights?.totals, nameFor, PIE_PALETTE), [insights?.totals, nameFor]);

  const chartTitle = useMemo(() => {
    const baseTitle = insights?.mode === 'uniqueUsers' ? 'Unique users over time' : 'Events over time';
    const suffix =
      viewMode === 'event' ? ' (by event)' :
        viewMode === 'promotion' ? ' (by promotion)' :
          insights?.groupedBy === 'place' ? ' (by place)' : '';
    return baseTitle + suffix;
  }, [insights?.mode, insights?.groupedBy, viewMode]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Mode toggle: Business / Event / Promotion */}
        <InsightsModeToggle
          value={viewMode}
          onChange={(mode) => {
            setViewMode(mode);
          }}
          options={[
            { key: 'business', label: 'Business' },
            { key: 'event', label: 'Event' },
            { key: 'promotion', label: 'Promotion' },
          ]}
        />
        {/* Secondary pickers for Event/Promotion modes */}
        {viewMode === 'event' && (
          <SelectorChips
            items={events}
            selectedIds={selectedEventIds}
            setSelectedIds={setSelectedEventIds}
            emptyText="No events found for this business."
          />
        )}
        {viewMode === 'promotion' && (
          <SelectorChips
            items={promotions}
            selectedIds={selectedPromotionIds}
            setSelectedIds={setSelectedPromotionIds}
            emptyText="No promotions found for this business."
          />
        )}
        {loading && <ActivityIndicator size="large" style={{ marginTop: 8 }} />}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <ChartsSection
            chartTitle={chartTitle}
            series={insights?.series || []}
            activeMap={activeSeries}
            onToggleSeries={(name) => setActiveSeries(prev => ({ ...prev, [name]: !prev[name] }))}
            getSeriesLabel={(s) => nameFor(s.name)}
            lineData={lineData}
            baseDates={base?.allDates}
            pieData={pieData}
            range={insights?.range}
            screenWidth={screenWidth}
            styles={styles}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
    paddingTop: 150,
    paddingBottom: 120,
  },
  chartTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 10, textAlign: 'left' },
  errorText: { color: '#d00', textAlign: 'center', marginTop: 8 },
  meta: { color: '#666', textAlign: 'center', marginTop: 10 },
});
