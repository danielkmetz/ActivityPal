import React from "react";
import { View, StyleSheet } from "react-native";

export default function SkeletonRow({ style }) {
  return (
    <View style={[styles.skelRow, style]}>
      <View style={styles.skelAvatar} />
      <View style={{ flex: 1 }}>
        <View style={styles.skelLineLg} />
        <View style={styles.skelLineSm} />
      </View>
      <View style={styles.skelBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  skelRow: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e6e6ef",
    flexDirection: "row",
    alignItems: "center",
  },
  skelAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111",
    opacity: 0.06,
    marginRight: 12,
  },
  skelLineLg: {
    height: 12,
    width: "65%",
    borderRadius: 8,
    backgroundColor: "#111",
    opacity: 0.06,
    marginBottom: 8,
  },
  skelLineSm: {
    height: 10,
    width: "45%",
    borderRadius: 8,
    backgroundColor: "#111",
    opacity: 0.05,
  },
  skelBtn: {
    width: 72,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#111",
    opacity: 0.06,
    marginLeft: 12,
  },
});
