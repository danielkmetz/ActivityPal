import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TouchableWithoutFeedback } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Avatar } from "react-native-paper";
import PhotoFeed from "../Photos/PhotoFeed";
import profilePicPlaceholder from "../../../assets/pics/profile-pic-placeholder.jpg";
import { logEngagementIfNeeded } from "../../../Slices/EngagementSlice";
import { useDispatch, useSelector } from "react-redux";
import { selection } from "../../../utils/Haptics/haptics";
import { selectUserAndFriendsPosts } from "../../../Slices/PostsSlice";
import { selectUser } from "../../../Slices/UserSlice";

const screenWidth = Dimensions.get("window").width;

export default function SuggestionMedia({
  suggestion,
  scrollX,              
  currentIndexRef,      
  setInviteModalVisible,
}) {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const suggestionContent = suggestion?.original ? suggestion?.original : suggestion;
  const sharedPost = suggestion?.type === "sharedPost" || !!suggestion?.original;
  const allPosts = useSelector(selectUserAndFriendsPosts);
  const me = useSelector(selectUser);
  const myUserId = me?._id || me?.id;
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
    invite?.sortDate ||
    invite?.createdAt ||
    invite?.sentAt ||
    invite?.createdOn ||
    invite?.updatedAt ||
    invite?.dateTime;

  // Pick a fallback image when suggestions have no media
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
    if (resolvedMedia?.length > 0) return suggestion;

    const fallback = pickFallbackUrl(suggestionContent);
    const fallbackPhotos = fallback
      ? [{ url: fallback, photoKey: `fallback-${suggestionContent?._id || placeId || Date.now()}` }]
      : [];

    if (suggestion?.original) {
      return { ...suggestion, original: { ...suggestion.original, photos: fallbackPhotos } };
    }
    return { ...suggestion, photos: fallbackPhotos };
  }, [suggestion, suggestionContent, resolvedMedia, placeId]);

  /* ---------------- derive "my invites" from unified posts ---------------- */
  const myInvites = useMemo(() => {
    const posts = Array.isArray(allPosts) ? allPosts : [];
    return posts.filter((p) => {
      const t = p?.type || p?.postType || p?.canonicalType;
      if (t !== "invite") return false;

      // owner checks (unified posts often include ownerId and/or owner{id})
      const ownerId = p?.ownerId || p?.owner?.id || p?.userId || p?.sender?.id || p?.sender?.userId;
      return String(ownerId || "") === String(myUserId || "");
    });
  }, [allPosts, myUserId]);

  /* ---------------- try to match an existing invite for this suggestion ---------------- */
  const rawInvite = useMemo(() => {
    if (!Array.isArray(myInvites) || !suggestionContent?.placeId) return null;

    const startMs = startTime ? new Date(startTime).getTime() : null;
    const endMs = endTime ? new Date(endTime).getTime() : null;

    return myInvites.find((invite) => {
      const samePlace = invite?.placeId === suggestionContent.placeId;
      const when = invite?.dateTime ? new Date(invite.dateTime).getTime() : null;

      if (!samePlace || when == null) return false;

      // "active" window: within [start, end]
      const isActive =
        (kind === "activePromo" || kind === "activeEvent") &&
        startMs != null &&
        endMs != null &&
        when >= startMs &&
        when <= endMs;

      // "upcoming" window: within ±1hr of start
      const isUpcoming =
        (kind === "upcomingPromo" || kind === "upcomingEvent") &&
        startMs != null &&
        Math.abs(when - startMs) <= 60 * 60 * 1000;

      return isActive || isUpcoming;
    }) || null;
  }, [myInvites, suggestionContent?.placeId, startTime, endTime, kind]);

  const sentAt = rawInvite ? getInviteSentAt(rawInvite) : null;
  const wasSentToday = sentAt ? isSameLocalDay(sentAt, new Date()) : false;
  const existingInvite = rawInvite && wasSentToday ? { ...rawInvite, type: "invite" } : null;

  /* ---------------- actions ---------------- */
  const onNavigateBusiness = () => {
    logEngagementIfNeeded(dispatch, {
      targetType: "place",
      targetId: placeId,
      placeId,
      engagementType: "click",
    });
    navigation.navigate("BusinessProfile", { business: suggestionContent });
  };

  const onInvitePress = () => {
    selection();
    if (existingInvite) {
      navigation.navigate("CreatePost", {
        postType: "invite",
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
      <PhotoFeed post={normalizedPost} scrollX={scrollX} currentIndexRef={currentIndexRef} />
      {/* overlay */}
      <View style={styles.overlayTopText}>
        <TouchableWithoutFeedback onPress={onNavigateBusiness}>
          <View style={styles.overlayBusiness}>
            <Avatar.Image
              size={45}
              // react-native-paper Avatar.Image doesn't use "rounded"; it’s a circle by default with size
              source={resolvedLogoUrl ? { uri: resolvedLogoUrl } : profilePicPlaceholder}
              style={styles.overlayAvatar}
            />
            <View style={styles.overlayTextContainer}>
              <Text style={[styles.overlayText, { fontSize: overlayTextSize }]} numberOfLines={1}>
                {businessName}
              </Text>
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
