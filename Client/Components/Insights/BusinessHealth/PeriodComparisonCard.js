import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PeriodComparisonCard({ kpis, loading }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Period Comparison</Text>
      {kpis.map((k) => {
        const delta = (k.prev > 0) ? ((k.value - k.prev) / k.prev) * 100 : (k.value > 0 ? 100 : 0);
        const deltaSign = delta > 0 ? '+' : delta < 0 ? '' : '';
        const color = delta > 0 ? '#059669' : delta < 0 ? '#DC2626' : '#6B7280';
        return (
          <View key={k.key} style={styles.compareRow}>
            <Text style={styles.compareLabel}>{k.label}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.compareNow}>
                {loading ? '—' : Intl.NumberFormat().format(k.value)}
              </Text>
              <Text style={[styles.compareDelta, { color }]}>
                {loading ? '' : `${deltaSign}${delta.toFixed(1)}% vs prev`}
              </Text>
            </View>
          </View>
        );
      })}
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
  compareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  compareLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  compareNow: { fontSize: 13, fontWeight: '700', color: '#111827' },
  compareDelta: { fontSize: 12, fontWeight: '700' },
});
