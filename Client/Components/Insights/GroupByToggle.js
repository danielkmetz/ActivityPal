import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

/**
 * Props:
 *  - value: 'type' | 'target'
 *  - onChange: (key) => void
 *  - options: [{ key: 'type'|'target', label: string }]
 */
export default function GroupByToggle({ value, onChange, options = [] }) {
  return (
    <View style={styles.row}>
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange?.(opt.key)}
            style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
          >
            <Text style={active ? styles.textActive : styles.text}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8, justifyContent: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipInactive: { backgroundColor: '#fff', borderColor: '#bbb' },
  text: { color: '#333' },
  textActive: { color: '#fff', fontWeight: '600' },
});
