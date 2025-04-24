import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function Notch() {
  return (
    <View style={styles.notchContainer}>
      <View style={styles.notch} />
    </View>
  );
}

const styles = StyleSheet.create({
  notchContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  notch: {
    width: 40,
    height: 5,
    backgroundColor: '#ccc',
    borderRadius: 3,
  },
});
