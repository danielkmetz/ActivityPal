import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

export default function InsightsModeToggle({
  value,                 // current mode (string)
  onChange,              // (nextValue) => void
  options = [            // [{ key: 'business', label: 'Business' }, ...]
    { key: 'business', label: 'Business' },
    { key: 'event', label: 'Event' },
    { key: 'promotion', label: 'Promotion' },
  ],
  style,                 // optional wrapper style override
}) {
  return (
    <View style={[styles.modeRow, style]}>
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange?.(opt.key)}
            style={[styles.modeChip, active ? styles.modeChipActive : styles.modeChipInactive]}
          >
            <Text style={active ? styles.modeTextActive : styles.modeText}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8, justifyContent: 'center' },
  modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  modeChipActive: { backgroundColor: '#111', borderColor: '#111' },
  modeChipInactive: { backgroundColor: '#fff', borderColor: '#bbb' },
  modeText: { color: '#333' },
  modeTextActive: { color: '#fff', fontWeight: '600' },
});
