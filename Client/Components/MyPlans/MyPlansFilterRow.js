import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const OPTIONS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
  { key: 'past', label: 'Past' },
];

export default function MyPlansFilterRow({ value, onChange }) {
  return (
    <View style={styles.filterRow}>
      {OPTIONS.map((opt) => {
        const isActive = value === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[
              styles.filterChip,
              isActive && styles.filterChipActive,
            ]}
            onPress={() => onChange && onChange(opt.key)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.filterChipText,
                isActive && styles.filterChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  filterChipText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
});
