import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function ProfileTabs({ active, onChange }) {
  const tabs = [
    { key: 'reviews', label: 'Posts' },
    { key: 'tagged',  label: 'Tagged' },
    { key: 'photos',  label: 'Photos' },
    { key: 'favorites', label: 'Favorites' },
  ];

  return (
    <View style={styles.navButtonsContainer}>
      {tabs.map(t => (
        <TouchableOpacity key={t.key} style={styles.navTab} onPress={() => onChange(t.key)}>
          <Text style={[styles.navTabText, active === t.key && styles.activeTabText]}>{t.label}</Text>
          {active === t.key && <View style={styles.navUnderline} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  navButtonsContainer: { flexDirection: "row", marginBottom: 5, marginLeft: 20, gap: 25 },
  navTab: { alignItems: "center" },
  navTabText: { fontSize: 16, color: "#555", fontWeight: "600" },
  activeTabText: { color: "#009999", fontWeight: "bold" },
  navUnderline: { height: 2, backgroundColor: "#009999", width: "100%", marginTop: 4, borderRadius: 2 },
});
