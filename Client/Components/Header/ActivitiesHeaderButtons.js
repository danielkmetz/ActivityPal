import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function ActivitiesHeaderButtons({
  onOpenPreferences,
  onOpenFilter,
  onToggleMapView,
  onClear,
  categoryFilter,
  isMapView,
  disableMapToggle,
  disableClear,
  style,
}) {
  return (
    <View style={[styles.activityHeaderButtons, style]}>
      <TouchableOpacity style={styles.headerButton} onPress={onOpenPreferences}>
        <Text style={styles.headerButtonText}>Preferences</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.headerButton, disableClear && styles.disabledButton]} onPress={onOpenFilter}>
        <Text style={styles.headerButtonText}>
          {categoryFilter ? `Filter: ${String(categoryFilter).replace(/_/g, " ")}` : "Filter/Sort"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.headerButton, disableMapToggle && styles.disabledButton]}
        onPress={onToggleMapView}
        disabled={!!disableMapToggle}
      >
        <Text style={styles.headerButtonText}>{isMapView ? "List View" : "Map View"}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.headerButton, disableClear && styles.disabledButton]}
        onPress={onClear}
        disabled={!!disableClear}
      >
        <Text style={styles.headerButtonText}>Clear</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  activityHeaderButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 5,
    paddingBottom: 10,
    paddingTop: 10,
  },
  headerButton: {
    flex: 1,
    backgroundColor: "#006666",
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: "center",
  },
  headerButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 13,
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
