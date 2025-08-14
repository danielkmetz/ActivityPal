import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

export default function InsightsSummaryBar({ kpis, onOpenDetails, loading }) {
  return (
    <View style={s.wrap}>
      {kpis.map((k) => (
        <View key={k.key} style={s.kpi}>
          <Text style={s.label}>{k.label.replace('Total ', '')}</Text>
          <Text style={s.value}>{loading ? '—' : Intl.NumberFormat().format(k.value)}</Text>
        </View>
      ))}
      <Pressable onPress={onOpenDetails} style={s.btn} hitSlop={8}>
        <Text style={s.btnTxt}>Details</Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  kpi: { flex: 1 },
  label: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  value: { fontSize: 16, fontWeight: '800', color: '#111827' },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  btnTxt: { fontSize: 12, fontWeight: '700', color: '#111827' },
});
