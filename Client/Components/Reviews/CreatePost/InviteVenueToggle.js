import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

export default function InviteVenueToggle({
  mode, // "place" | "custom"
  onSelectPlace,
  onSelectCustom,
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.modeBtn, mode === "place" && styles.modeBtnActive]}
        onPress={onSelectPlace}
      >
        <Text style={styles.modeBtnText}>Place</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.modeBtn, mode === "custom" && styles.modeBtnActive]}
        onPress={onSelectCustom}
      >
        <Text style={styles.modeBtnText}>Custom (Private)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
  },
  modeBtnActive: {
    borderColor: "#009999",
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
