import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function KpiCard({ label, value, prev, loading }) {
  const delta = (prev > 0) ? ((value - prev) / prev) * 100 : (value > 0 ? 100 : 0);
  const deltaSign = delta > 0 ? '+' : delta < 0 ? '' : '';
  const deltaColor = delta > 0 ? '#059669' : delta < 0 ? '#DC2626' : '#6B7280';

  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{loading ? '—' : Intl.NumberFormat().format(value)}</Text>
      <Text style={[styles.kpiDelta, { color: deltaColor }]}>
        {loading ? '' : `${deltaSign}${delta.toFixed(1)}% vs prev`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEF2F7',
  },
  kpiLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  kpiValue: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 2 },
  kpiDelta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
});
