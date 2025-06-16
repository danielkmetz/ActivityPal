import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SectionHeader = ({ title }) => (
  <View style={styles.sectionContainer}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionDivider} />
  </View>
);

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 20,
    marginBottom: 5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#ccc',
    width: '100%',
  },
});

export default SectionHeader;