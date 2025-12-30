import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import ProfilePic from "../Reviews/PostHeader/ProfilePic";

export default function DiscoverUserRow({
  user,
  onPressProfile,
  onPressFollow,
  followLabel,
  followDisabled,
  subtitle,
  style,
}) {
  const userId = user?.id || user?._id || user?.userId;
  const profilePicUrl = user?.profilePicUrl || user?.presignedProfileUrl;
  const name = useMemo(() => {
    const first = (user?.firstName || "").trim();
    const last = (user?.lastName || "").trim();
    const full = `${first} ${last}`.trim();

    // optional fallbacks if your API sometimes returns these
    const altFull = (user?.fullName || "").trim();
    const fallback = "Friend";

    return full || altFull || fallback;
  }, [user?.firstName, user?.lastName, user?.fullName]);

  const sub = subtitle || "Tap to view profile";
  const btnLabel = followLabel || "Follow";
  const disabled = !!followDisabled;

  return (
    <TouchableOpacity
      style={[styles.row, style]}
      onPress={onPressProfile || (() => {})}
      activeOpacity={0.85}
    >
      <ProfilePic 
        userId={userId}
        profilePicUrl={profilePicUrl}
      />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.rowTitle}>{name}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <TouchableOpacity
        style={[styles.followBtn, disabled && styles.followBtnDisabled]}
        onPress={onPressFollow || (() => {})}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <Text style={[styles.followBtnText, disabled && styles.followBtnTextDisabled]}>
          {btnLabel}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e6e6ef",
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111",
    opacity: 0.06,
    marginRight: 12,
  },
  rowTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  rowSub: { marginTop: 2, fontSize: 12, color: "#666" },

  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#111",
    marginLeft: 12,
  },
  followBtnDisabled: {
    backgroundColor: "#eef0f6",
  },
  followBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  followBtnTextDisabled: { color: "#111" },
});
