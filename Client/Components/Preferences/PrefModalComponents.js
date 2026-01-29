import React from "react";
import { View, Text, TouchableOpacity, Switch } from "react-native";
import styles from "./PrefModalStyles";

export function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ToggleRow({ label, value, onChange }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.optionLabel}>{label}</Text>
      <Switch
        value={!!value}
        onValueChange={onChange}
        trackColor={{ false: "#ccc", true: "#2196F3" }}
        thumbColor={value ? "#2196F3" : "#f4f3f4"}
      />
    </View>
  );
}
