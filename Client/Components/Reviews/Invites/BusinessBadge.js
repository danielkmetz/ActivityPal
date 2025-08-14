import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

export default function BusinessBadge({ name, logoUrl }) {
  return (
    <View style={styles.row}>
      {!!logoUrl && <Image source={{ uri: logoUrl }} style={styles.logo} />}
      <Text style={styles.name}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  logo: { width: 30, height: 30, borderRadius: 15, marginRight: 10 },
  name: { fontSize: 16, fontWeight: '600', marginVertical: 5, color: '#333' },
});
