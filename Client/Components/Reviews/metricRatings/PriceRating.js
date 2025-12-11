import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function PriceRating({ value, onChange }) {
  return (
    <View>
      <Text style={styles.label}>Price (optional)</Text>
      <View style={styles.group}>
        {[1, 2, 3, 4].map((val) => (
          <TouchableOpacity
            key={val}
            style={[styles.button, value === val && styles.active]}
            onPress={() => onChange(val)}
          >
            <Text style={[styles.text, value === val && styles.activeText]}>
              {'$'.repeat(val)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '500', marginBottom: 6 },
  group: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  button: { padding: 6, borderWidth: 1, borderColor: '#ccc', borderRadius: 6 },
  active: { backgroundColor: '#333', borderColor: '#333' },
  text: { color: '#555' },
  activeText: { color: '#fff', fontWeight: 'bold' },
});
