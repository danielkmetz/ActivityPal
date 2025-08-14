import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const PRESETS = [
  { key: 'all',   label: 'All' },
  { key: '7d',    label: '7D'  },
  { key: '30d',   label: '30D' },
  { key: '90d',   label: '90D' },
  { key: 'ytd',   label: 'YTD' },
  { key: 'custom', label: 'Custom' },
];

/**
 * Props (JS):
 *  - value: { preset: 'all'|'7d'|'30d'|'90d'|'ytd'|'custom', startDate?: Date|null, endDate?: Date|null }
 *  - onChange: (nextValue) => void
 */
export default function DateRangePicker({ value, onChange }) {
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  const preset = value?.preset || '30d';
  const startDate = value?.startDate || null;
  const endDate = value?.endDate || null;

  const setPreset = (p) => {
    if (p === 'all') {
      onChange?.({ preset: 'all', startDate: null, endDate: null });
      return;
    }
    if (p !== 'custom') {
      onChange?.({ preset: p, startDate: null, endDate: null });
      return;
    }
    const today = new Date();
    onChange?.({
      preset: 'custom',
      startDate: startDate ?? today,
      endDate: endDate ?? today,
    });
  };

  const updateStart = (d) => {
    const next = new Date(d);
    const safeEnd = endDate && next > endDate ? next : endDate;
    onChange?.({ preset: 'custom', startDate: next, endDate: safeEnd || next });
  };

  const updateEnd = (d) => {
    const next = new Date(d);
    const safeStart = startDate && next < startDate ? next : startDate;
    onChange?.({ preset: 'custom', startDate: safeStart || next, endDate: next });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {PRESETS.map((p) => {
          const active = preset === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPreset(p.key)}
              style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            >
              <Text style={active ? styles.chipTextActive : styles.chipText}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {preset === 'custom' && (
        <View style={styles.customRow}>
          <Pressable onPress={() => setShowStart(true)} style={styles.dateBtn}>
            <Text style={styles.dateBtnText}>
              {startDate ? startDate.toLocaleDateString() : 'Start date'}
            </Text>
          </Pressable>
          <Text style={styles.toText}>to</Text>
          <Pressable onPress={() => setShowEnd(true)} style={styles.dateBtn}>
            <Text style={styles.dateBtnText}>
              {endDate ? endDate.toLocaleDateString() : 'End date'}
            </Text>
          </Pressable>

          {showStart && (
            <DateTimePicker
              value={startDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(event, d) => {
                setShowStart(false);
                if (d) updateStart(d);
              }}
              maximumDate={endDate || undefined}
            />
          )}

          {showEnd && (
            <DateTimePicker
              value={endDate || startDate || new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(event, d) => {
                setShowEnd(false);
                if (d) updateEnd(d);
              }}
              minimumDate={startDate || undefined}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipInactive: { backgroundColor: '#fff', borderColor: '#bbb' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  dateBtn: { borderWidth: 1, borderColor: '#bbb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  dateBtnText: { color: '#111', fontWeight: '600' },
  toText: { color: '#555' },
});
