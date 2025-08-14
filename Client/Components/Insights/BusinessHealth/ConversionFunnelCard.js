import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ConversionFunnelCard({ views, clicks, joins, loading }) {
  const safe = (n) => (Number.isFinite(n) ? n : 0);
  const viewToClick = safe(views) > 0 ? (safe(clicks) / safe(views)) * 100 : 0;
  const clickToJoin = safe(clicks) > 0 ? (safe(joins) / safe(clicks)) * 100 : 0;
  const overall = safe(views) > 0 ? (safe(joins) / safe(views)) * 100 : 0;

  const bar = (pct) => ({
    width: `${Math.max(8, Math.min(100, pct))}%`,
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Conversion Funnel</Text>

      <View style={styles.funnelRow}>
        <Text style={styles.funnelStep}>Views</Text>
        <Text style={styles.funnelVal}>{loading ? '—' : Intl.NumberFormat().format(views)}</Text>
      </View>
      <View style={styles.progressWrap}>
        <View style={[styles.progressBar, bar(viewToClick)]} />
      </View>
      <Text style={styles.progressMeta}>{loading ? '' : `View → Click: ${viewToClick.toFixed(1)}%`}</Text>

      <View style={[styles.funnelRow, { marginTop: 8 }]}>
        <Text style={styles.funnelStep}>Clicks</Text>
        <Text style={styles.funnelVal}>{loading ? '—' : Intl.NumberFormat().format(clicks)}</Text>
      </View>
      <View style={styles.progressWrap}>
        <View style={[styles.progressBar, bar(clickToJoin)]} />
      </View>
      <Text style={styles.progressMeta}>{loading ? '' : `Click → Join: ${clickToJoin.toFixed(1)}%`}</Text>

      <View style={[styles.funnelRow, { marginTop: 8 }]}>
        <Text style={styles.funnelStep}>Joins</Text>
        <Text style={styles.funnelVal}>{loading ? '—' : Intl.NumberFormat().format(joins)}</Text>
      </View>
      <Text style={[styles.progressMeta, { marginTop: 6 }]}>
        {loading ? '' : `Overall: ${overall.toFixed(1)}% (Views → Joins)`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#111827' },
  funnelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  funnelStep: { fontSize: 13, fontWeight: '600', color: '#374151' },
  funnelVal: { fontSize: 13, fontWeight: '700', color: '#111827' },
  progressWrap: {
    backgroundColor: '#F3F4F6',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBar: { backgroundColor: '#3B82F6', height: '100%' },
  progressMeta: { fontSize: 12, marginTop: 2, color: '#6B7280' },
});
