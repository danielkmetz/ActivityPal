import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CountdownPill({ label = 'Starts in:', value }) {
  if (!value) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 15, padding: 10, backgroundColor: '#e6f0ff', borderRadius: 8, alignItems: 'center' },
  label: { fontSize: 13, color: '#666' },
  value: { fontSize: 18, fontWeight: 'bold', color: '#007bff' },
});
