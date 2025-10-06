import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

export default function FollowButton({
  isSuggestedFollowPost,
  isFollowing,
  isRequestReceived,
  isRequestSent,
  onAcceptRequest,
  onDenyRequest,
  onCancelRequest,
  onFollow,
  onPressFollowing, // when user taps "Following" (opens profile)
}) {
  if (!isSuggestedFollowPost) return null;

  if (isFollowing) {
    return (
      <TouchableOpacity style={s.followButton} onPress={onPressFollowing}>
        <Text style={s.followingText}>Following</Text>
      </TouchableOpacity>
    );
  }

  if (isRequestReceived) {
    return (
      <View style={s.requestButtonsContainer}>
        <TouchableOpacity style={s.acceptRequestButton} onPress={onAcceptRequest}>
          <Text style={s.acceptRequestText}>Accept Request</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.followButton} onPress={onDenyRequest}>
          <Text style={s.followButtonText}>Deny Request</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isRequestSent) {
    return (
      <TouchableOpacity style={s.followButton} onPress={onCancelRequest}>
        <Text style={s.followButtonText}>Cancel Request</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={s.followButton} onPress={onFollow}>
      <Text style={s.followButtonText}>Follow</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  requestButtonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  acceptRequestButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#2c7a7b", // teal-ish accept
  },
  acceptRequestText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
  followButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#b3b3b3",
  },
  followButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
  followingText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
  },
});
