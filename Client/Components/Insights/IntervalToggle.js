import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

export default function IntervalToggle({
  value,
  onChange,
  options = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ],
  disabledKeys = [], // ⬅️ new
}) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = value === opt.key;
        const disabled = disabledKeys.includes(opt.key);
        return (
          <Pressable
            key={opt.key}
            onPress={() => !disabled && onChange?.(opt.key)}
            style={[
              styles.chip,
              active ? styles.active : styles.inactive,
              disabled && styles.disabledChip,
            ]}
            disabled={disabled}
          >
            <Text
              style={[
                active ? styles.activeText : styles.text,
                disabled && styles.disabledText,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  active: { backgroundColor: '#111', borderColor: '#111' },
  inactive: { backgroundColor: '#fff', borderColor: '#bbb' },
  text: { color: '#333' },
  activeText: { color: '#fff', fontWeight: '600' },
  // disabled look
  disabledChip: { opacity: 0.4 },
  disabledText: { color: '#999' },
});
