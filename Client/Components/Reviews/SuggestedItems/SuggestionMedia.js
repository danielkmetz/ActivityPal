import React, { useMemo, useState, useRef } from "react";
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, TouchableWithoutFeedback, Animated } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Avatar } from "react-native-paper";
import { useDispatch, useSelector } from "react-redux";
import PhotoFeed from "../Photos/PhotoFeed";
import profilePicPlaceholder from "../../../assets/pics/profile-pic-placeholder.jpg";
import { logEngagementIfNeeded } from "../../../Slices/EngagementSlice";
import { selection } from "../../../utils/Haptics/haptics";
import { selectUserAndFriendsPosts } from "../../../Slices/PostsSelectors/postsSelectors";
import { selectUser } from "../../../Slices/UserSlice";
import { getTimeLabel } from "../../../utils/formatEventPromoTime";

const screenWidth = Dimensions.get("window").width;

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

const pickFallbackUrl = (s) =>
  s?.bannerUrl ||
  s?.coverUrl ||
  s?.imageUrl ||
  s?.photoUrl ||
  s?.url ||
  s?.logoUrl ||
  s?.businessLogoUrl ||
  null;

export default function SuggestionMedia({
  suggestion,
  scrollX,
  setInviteModalVisible,
}) {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const suggestionContent = suggestion?.original ?? suggestion ?? {};
  const details = suggestionContent?.details;
  const sharedPost = suggestion?.type === "sharedPost" || !!suggestion?.original;
  const allPosts = useSelector(selectUserAndFriendsPosts);
  const me = useSelector(selectUser);
  const myUserId = me?._id || me?.id;

  const {
    businessName,
    logoUrl,
    businessLogoUrl,
    distance,
    placeId,
    startTime,
    endTime,
    kind,
  } = suggestionContent || {};

  const resolvedLogoUrl = logoUrl || businessLogoUrl;
  const title = details?.title || suggestionContent?.title;
  const description = details?.description || suggestionContent?.description;
  const overlayTextSize = sharedPost ? 14 : 16;
  const [overlayVisible, setOverlayVisible] = useState(true);
  const internalScrollX = useRef(new Animated.Value(0)).current;
  const sx = scrollX || internalScrollX;

  const fallbackUrl = useMemo(
    () => pickFallbackUrl(suggestionContent),
    [suggestionContent?._id, suggestionContent?.placeId, suggestionContent?.bannerUrl, suggestionContent?.coverUrl, suggestionContent?.imageUrl, suggestionContent?.photoUrl, suggestionContent?.url, suggestionContent?.logoUrl, suggestionContent?.businessLogoUrl]
  );

  const myInvites = useMemo(() => {
    const posts = Array.isArray(allPosts) ? allPosts : [];
    return posts.filter((p) => {
      const t = p?.type || p?.postType || p?.canonicalType;
      if (t !== "invite") return false;

      const ownerId =
        p?.ownerId ||
        p?.owner?.id ||
        p?.userId ||
        p?.sender?.id ||
        p?.sender?.userId;

      return String(ownerId || "") === String(myUserId || "");
    });
  }, [allPosts, myUserId]);

  const rawInvite = useMemo(() => {
    if (!Array.isArray(myInvites) || !suggestionContent?.placeId) return null;

    const startMs = startTime ? new Date(startTime).getTime() : null;
    const endMs = endTime ? new Date(endTime).getTime() : null;

    return (
      myInvites.find((invite) => {
        const samePlace = invite?.placeId === suggestionContent.placeId;
        const when = invite?.dateTime ? new Date(invite.dateTime).getTime() : null;
        if (!samePlace || when == null) return false;

        const isActive =
          (kind === "activePromo" || kind === "activeEvent") &&
          startMs != null &&
          endMs != null &&
          when >= startMs &&
          when <= endMs;

        const isUpcoming =
          (kind === "upcomingPromo" || kind === "upcomingEvent") &&
          startMs != null &&
          Math.abs(when - startMs) <= 60 * 60 * 1000;

        return isActive || isUpcoming;
      }) || null
    );
  }, [myInvites, suggestionContent?.placeId, startTime, endTime, kind]);

  const sentAt = rawInvite ? getInviteSentAt(rawInvite) : null;
  const wasSentToday = sentAt ? isSameLocalDay(sentAt, new Date()) : false;
  const existingInvite = rawInvite && wasSentToday ? { ...rawInvite, type: "invite" } : null;

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

  return (
    <View style={styles.photoWrapper}>
      <PhotoFeed
        post={suggestion}
        setOverlayVisible={setOverlayVisible}
        scrollX={sx}
        fallbackUrl={fallbackUrl} // ✅ NEW
      />
      {overlayVisible && (
        <View style={styles.placeNameOverlay}>
          <TouchableWithoutFeedback onPress={onNavigateBusiness}>
            <View style={styles.overlayBusiness}>
              <Avatar.Image
                size={25}
                source={resolvedLogoUrl ? { uri: resolvedLogoUrl } : profilePicPlaceholder}
                style={styles.overlayAvatar}
              />
              <View style={styles.overlayTextContainer}>
                <Text style={[styles.overlayText, { fontSize: overlayTextSize }]} numberOfLines={1}>
                  {businessName}
                </Text>
                {distance && (
                  <Text style={styles.overlaySubText}>
                    {`${(distance / 1609).toFixed(1)} mi away`}
                  </Text>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      )}
      {overlayVisible && (
        <View style={styles.overlayTopText}>
          <View style={styles.bottomTextContainer}>
            <Text style={styles.eventPromoTitle} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
            <Text style={styles.eventPromoDescription} numberOfLines={2} ellipsizeMode="tail">
              {description}
            </Text>
            <Text style={styles.eventPromoTime}>{getTimeLabel(suggestionContent)}</Text>
          </View>
          <TouchableOpacity style={styles.inviteButton} onPress={onInvitePress}>
            <Text style={styles.inviteText}>{existingInvite ? "Edit Invite" : "Invite"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  photoWrapper: { position: "relative", alignSelf: "center" },
  placeNameOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: screenWidth,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 8,
    zIndex: 2,
  },
  overlayTopText: {
    position: "absolute",
    bottom: 15,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.65)",
    padding: 8,
    width: screenWidth,
    zIndex: 2,
  },
  bottomTextContainer: { flex: 1, flexShrink: 1, marginRight: 8 },
  overlayBusiness: { flexDirection: "row", alignItems: "center" },
  overlayAvatar: { backgroundColor: "#ccc", marginRight: 10 },
  overlayTextContainer: { flexShrink: 1, marginLeft: 5 },
  eventPromoTitle: { color: "white", fontSize: 20, flexShrink: 1 },
  eventPromoDescription: { color: "white", fontSize: 15, flexShrink: 1 },
  overlayText: { color: "white", fontWeight: "bold" },
  overlaySubText: { color: "white", fontSize: 13 },
  inviteButton: {
    backgroundColor: "#1E88E5",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 15,
    elevation: 2,
    marginLeft: 8,
  },
  inviteText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  eventPromoTime: { fontSize: 14, color: "#d32f2f", fontWeight: "600", marginTop: 4 },
});
