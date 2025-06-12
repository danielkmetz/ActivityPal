import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function WouldRecommend({ value, onChange }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Would recommend?</Text>
      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={[styles.button, value === true && styles.activeButton]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.buttonText, value === true && styles.activeButtonText]}>Yes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, value === false && styles.activeButton]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.buttonText, value === false && styles.activeButtonText]}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  activeButton: {
    backgroundColor: '#009999',
    borderColor: '#009999',
  },
  buttonText: {
    fontSize: 14,
    color: '#555',
  },
  activeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
