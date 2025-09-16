import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ReplayStatsRow({ uniqueViewers, peakViewers, durationSec }) {
  const formatNum = (n) => {
    if (n == null) return '—';
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n/1000).toFixed(n % 1000 ? 1 : 0)}K`;
    return `${(n/1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  };

  const formatDuration = (s) => {
    if (!s && s !== 0) return '—';
    const m = Math.floor(s / 60), sec = s % 60;
    return m ? `${m}m ${sec}s` : `${sec}s`;
  };

  // Hide completely if no stats provided
  if (
    uniqueViewers == null &&
    peakViewers == null &&
    durationSec == null
  ) return null;

  return (
    <View style={S.wrap}>
      <Text style={S.title}>Insights</Text>
      <View style={S.row}>
        <View style={S.box}>
          <Text style={S.val}>{formatNum(uniqueViewers)}</Text>
          <Text style={S.label}>Unique viewers</Text>
        </View>
        <View style={S.divider} />
        <View style={S.box}>
          <Text style={S.val}>{formatNum(peakViewers)}</Text>
          <Text style={S.label}>Peak live</Text>
        </View>
        <View style={S.divider} />
        <View style={S.box}>
          <Text style={S.val}>{formatDuration(durationSec)}</Text>
          <Text style={S.label}>Duration</Text>
        </View>
      </View>
      <Text style={S.foot}>Doesn’t include you (the host)</Text>
    </View>
  );
}

const S = StyleSheet.create({
  wrap: { padding: 12, gap: 8, backgroundColor: '#0f0f0f', borderTopWidth: 1, borderColor: '#1f1f1f' },
  title: { color: '#fff', fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#111', borderRadius: 12, overflow: 'hidden' },
  box: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  divider: { width: 1, backgroundColor: '#1f1f1f' },
  val: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 22 },
  label: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  foot: { color: '#6b7280', fontSize: 11 },
});
