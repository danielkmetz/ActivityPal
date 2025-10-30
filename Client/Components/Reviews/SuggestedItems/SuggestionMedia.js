import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TouchableWithoutFeedback } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Avatar } from "react-native-paper";
import PhotoFeed from "../Photos/PhotoFeed";
import profilePicPlaceholder from "../../../assets/pics/profile-pic-placeholder.jpg";
import { logEngagementIfNeeded } from "../../../Slices/EngagementSlice";
import { useDispatch, useSelector } from "react-redux";
import { selection } from "../../../utils/Haptics/haptics";
import { selectInvites } from "../../../Slices/InvitesSlice";

const screenWidth = Dimensions.get("window").width;

export default function SuggestionMedia({
  suggestion,
  scrollX,              // Animated.Value
  currentIndexRef,      // ref
  setInviteModalVisible,
}) {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const suggestionContent = suggestion?.original ? suggestion?.original : suggestion;
  const sharedPost = suggestion?.type === 'sharedPost' || suggestion?.original;
  const invites = useSelector(selectInvites);
  const {
    businessName,
    logoUrl,
    businessLogoUrl,
    distance,
    media,
    placeId,
    photos,
    startTime,
    endTime,
    kind,
  } = suggestionContent || {};

  const resolvedLogoUrl = logoUrl || businessLogoUrl;
  const resolvedMedia = photos || media || [];
  const overlayTextSize = sharedPost ? 14 : 16;

  /* ---------------- helpers ---------------- */
  const isSameLocalDay = (a, b) => {
    const da = new Date(a);
    const db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  };
  const getInviteSentAt = (invite) =>
    invite?.createdAt ||
    invite?.sentAt ||
    invite?.createdOn ||
    invite?.timestamp ||
    invite?.updatedAt ||
    invite?.dateTime;

  // If no media, try to pick a reasonable fallback image URL
  const pickFallbackUrl = (s) =>
    s?.bannerUrl ||
    s?.coverUrl ||
    s?.imageUrl ||
    s?.photoUrl ||
    s?.url ||
    s?.logoUrl ||
    s?.businessLogoUrl ||
    null;

  // Always pass a post with a photos array so PhotoFeed can render
  const normalizedPost = useMemo(() => {
    if (resolvedMedia?.length > 0) {
      // already has media — just return the original suggestion untouched
      return suggestion;
    }
    const fallback = pickFallbackUrl(suggestionContent);
    const fallbackPhotos = fallback
      ? [{ url: fallback, photoKey: `fallback-${suggestionContent?._id || placeId || Date.now()}` }]
      : [];

    // Place photos where PhotoFeed reads them: on original if present, else top-level
    if (suggestion?.original) {
      return { ...suggestion, original: { ...suggestion.original, photos: fallbackPhotos } };
    }
    return { ...suggestion, photos: fallbackPhotos };
  }, [suggestion, suggestionContent, resolvedMedia, placeId]);

  /* ---------------- invite detection ---------------- */
  const rawInvite = invites.find(invite => {
    if (!invite.placeId || !invite.dateTime) return false;

    const inviteTime = new Date(invite.dateTime).getTime();
    const startMs = startTime ? new Date(startTime).getTime() : null;
    const endMs = endTime ? new Date(endTime).getTime() : null;

    const isSamePlace = invite.placeId === suggestionContent.placeId;

    const isActive =
      (kind === "activePromo" || kind === "activeEvent") &&
      startMs != null && endMs != null &&
      inviteTime >= startMs && inviteTime <= endMs;

    const isUpcoming =
      (kind === "upcomingPromo" || kind === "upcomingEvent") &&
      startMs != null &&
      Math.abs(inviteTime - startMs) <= 60 * 60 * 1000;

    return isSamePlace && (isActive || isUpcoming);
  });

  const sentAt = rawInvite ? getInviteSentAt(rawInvite) : null;
  const wasSentToday = sentAt ? isSameLocalDay(sentAt, new Date()) : false;
  const existingInvite = rawInvite && wasSentToday ? { ...rawInvite, type: "invite" } : false;

  /* ---------------- actions ---------------- */
  const onNavigateBusiness = () => {
    logEngagementIfNeeded(dispatch, {
      targetType: 'place',
      targetId: placeId,
      placeId,
      engagementType: 'click',
    });
    navigation.navigate("BusinessProfile", { business: suggestionContent });
  };

  const onInvitePress = () => {
    selection();
    if (existingInvite) {
      navigation.navigate('CreatePost', {
        postType: 'invite',
        isEditing: true,
        initialPost: existingInvite,
      });
    } else {
      setInviteModalVisible?.(true);
    }
  };

  /* ---------------- render ---------------- */
  return (
    <View style={styles.photoWrapper}>
      <PhotoFeed
        post={normalizedPost}
        scrollX={scrollX}
        currentIndexRef={currentIndexRef}
      />
      {/* overlay */}
      <View style={styles.overlayTopText}>
        <TouchableWithoutFeedback onPress={onNavigateBusiness}>
          <View style={styles.overlayBusiness}>
            <Avatar.Image
              size={45}
              rounded
              source={resolvedLogoUrl ? { uri: resolvedLogoUrl } : profilePicPlaceholder}
              containerStyle={styles.overlayAvatar}
            />
            <View style={styles.overlayTextContainer}>
              <Text style={[styles.overlayText, { fontSize: overlayTextSize }]}>{businessName}</Text>
              <Text style={styles.overlaySubText}>
                {distance ? `${(distance / 1609).toFixed(1)} mi away` : null}
              </Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
        <TouchableOpacity style={styles.inviteButton} onPress={onInvitePress}>
          <Text style={styles.inviteText}>{existingInvite ? "Edit Invite" : "Invite"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoWrapper: {
    position: "relative",
    alignSelf: "center",
  },
  overlayTopText: {
    position: "absolute",
    bottom: 15,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    width: screenWidth,
    zIndex: 2,
  },
  overlayBusiness: {
    flexDirection: "row",
    alignItems: "center",
  },
  overlayAvatar: {
    backgroundColor: "#ccc",
    marginRight: 10,
  },
  overlayTextContainer: {
    flexShrink: 1,
    marginLeft: 5,
  },
  overlayText: {
    color: "white",
    fontWeight: "bold",
  },
  overlaySubText: {
    color: "white",
    fontSize: 13,
  },
  inviteButton: {
    position: "absolute",
    right: 10,
    backgroundColor: "#1E88E5",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 15,
    elevation: 2,
  },
  inviteText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
});
