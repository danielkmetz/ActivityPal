import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";

export default function EventDropdown({ events = [], show, onToggle, onDetails, scaleAnim }) {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) return null;

  return (
    <View style={styles.dropdownContainer}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.dropdownHeader}
        activeOpacity={0.8}
      >
        <View style={styles.starRow}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Text style={styles.star}>⭐</Text>
          </Animated.View>
          <Text style={styles.dropdownTitle}>Events Today!</Text>
        </View>
        <Text style={styles.dropIcon}>{show ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {show && (
        <View style={styles.dropdownContent}>
          {list.map((event) => (
            <View key={event?._id || event?.id || event?.title} style={styles.dropdownItem}>
              <Text style={styles.itemText}>{event?.title || ""}</Text>
              <TouchableOpacity onPress={() => onDetails?.(event)}>
                <Text style={styles.detailsButton}>Details</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdownContainer: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  dropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: "#ccc",
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  dropIcon: {
    marginRight: 10,
  },
  dropdownContent: {
    paddingVertical: 6,
  },
  dropdownItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  itemText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
    marginRight: 10,
  },
  detailsButton: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "600",
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  star: {
    fontSize: 18,
    marginRight: 10,
  },
});
