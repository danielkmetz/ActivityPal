import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function LockedPlaceHeader({
  label = "Suggested",
  title,
  subtitle,
  rightLabel,
  onPressRight,
}) {
  if (!title) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="lock" size={16} color="#6B7280" />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!rightLabel && !!onPressRight && (
        <TouchableOpacity onPress={onPressRight} style={styles.pill}>
          <Text style={styles.pillText}>{rightLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    marginBottom: 12,
  },
  left: { flex: 1, marginRight: 8 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  label: { fontSize: 12, color: "#6B7280", marginLeft: 6 },
  title: { fontSize: 14, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
  },
  pillText: { fontSize: 12, fontWeight: "700", color: "#111827" },
});
