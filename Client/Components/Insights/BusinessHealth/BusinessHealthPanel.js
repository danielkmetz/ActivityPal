import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import KpiCard from './KpiCard';
import ConversionFunnelCard from './ConversionFunnelCard';
import PeriodComparisonCard from './PeriodComparisonCard';

export default function BusinessHealthPanel({ loading, error, insights, interval, rangeLabel }) {
  const extractTotals = (ins) => {
    const t = ins?.totals || {};
    const fromTotals = {
      views: t.view ?? 0,
      clicks: t.click ?? 0,
      joins: t.join ?? 0,
    };
    if ((fromTotals.views || fromTotals.clicks || fromTotals.joins) > 0) return fromTotals;

    const series = ins?.series || [];
    const acc = { views: 0, clicks: 0, joins: 0 };
    for (const s of series) {
      const sum = (s?.points || []).reduce((z, p) => z + (Number(p?.v) || 0), 0);
      const n = (s?.name || '').toLowerCase();
      if (n.includes('view')) acc.views += sum;
      else if (n.includes('click')) acc.clicks += sum;
      else if (n.includes('join')) acc.joins += sum;
    }
    return acc;
  };

  const extractPrevTotals = (ins) => {
    const p = ins?.prevTotals || ins?.previousTotals || null;
    if (p) {
      return {
        views: p.view ?? p.views ?? 0,
        clicks: p.click ?? p.clicks ?? 0,
        joins: p.join ?? p.joins ?? 0,
      };
    }
    return { views: 0, clicks: 0, joins: 0 };
  };

  const current = extractTotals(insights);
  const previous = extractPrevTotals(insights);

  const kpiCards = [
    { key: 'views', label: 'Total Views', value: current.views, prev: previous.views },
    { key: 'clicks', label: 'Total Clicks', value: current.clicks, prev: previous.clicks },
    { key: 'joins', label: 'Total Joins', value: current.joins, prev: previous.joins },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Business Health</Text>
        <Text style={styles.subtitle}>{`Interval: ${interval.toUpperCase()} • Range: ${rangeLabel}`}</Text>
      </View>

      <View style={styles.kpiRow}>
        {kpiCards.map((k) => (
          <KpiCard key={k.key} label={k.label} value={k.value} prev={k.prev} loading={loading} />
        ))}
      </View>

      <ConversionFunnelCard
        views={current.views}
        clicks={current.clicks}
        joins={current.joins}
        loading={loading}
      />

      <PeriodComparisonCard kpis={kpiCards} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  headerRow: { marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 2, color: '#6B7280', fontSize: 12, fontWeight: '500' },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
