import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';

export default function ServiceSlider({ value, onChange }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Service</Text>
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Poor</Text>
        <Slider
          style={{ flex: 1 }}
          minimumValue={0}
          maximumValue={5}
          step={1}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor="#009999"
          maximumTrackTintColor="#ccc"
          thumbTintColor="#009999"
        />
        <Text style={styles.sliderLabel}>Excellent</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 10 },
  label: { fontWeight: '500', marginBottom: 6 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderLabel: { width: 60, fontSize: 12, textAlign: 'center', color: '#555' },
});
