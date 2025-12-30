import React from "react";
import { View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function InviteFriendsCardSkeleton({ style }) {
  return (
    <View style={[styles.inviteCard, style]}>
      <View style={styles.inviteIconWrap}>
        <MaterialCommunityIcons name="account-plus" size={22} color="#111" style={{ opacity: 0.35 }} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.skelLineLg} />
        <View style={[styles.skelLineSm, { width: "55%" }]} />
      </View>
      <View style={styles.skelBtnWide} />
    </View>
  );
}

const styles = StyleSheet.create({
  inviteCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e6e6ef",
    flexDirection: "row",
    alignItems: "center",
  },
  inviteIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#111",
    opacity: 0.08,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
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
  skelBtnWide: {
    width: 86,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#111",
    opacity: 0.06,
    marginLeft: 12,
  },
});
