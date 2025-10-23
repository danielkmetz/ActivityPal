import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Avatar } from "react-native-paper";
import PhotoFeed from "../Photos/PhotoFeed";
import PhotoItem from "../Photos/PhotoItem";
import profilePicPlaceholder from "../../../assets/pics/profile-pic-placeholder.jpg";
import { logEngagementIfNeeded, getEngagementTarget } from "../../../Slices/EngagementSlice";
import { useDispatch, useSelector } from "react-redux";
import { selection } from "../../../utils/Haptics/haptics";
import { selectInvites } from "../../../Slices/InvitesSlice";
import SuggestionDetailsModal from "../../SuggestionDetails/SuggestionDetailsModal";

const screenWidth = Dimensions.get("window").width;

export default function SuggestionMedia({
  suggestion,
  scrollX,              // Animated.Value
  currentIndexRef,      // ref
}) {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
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
      // If you handle InviteModal here, keep state for it; otherwise navigate to your create flow:
      navigation.navigate('CreatePost', { postType: 'invite', initialPlace: { placeId, name: businessName, startTime } });
    }
  };

  const onOpenFullScreen = () => {
    selection();
    setDetailsModalVisible(true);
    const { targetType, targetId } = getEngagementTarget(suggestionContent);
    logEngagementIfNeeded(dispatch, {
      targetType,
      targetId,
      placeId,
      engagementType: 'click',
    });
  };

  const mediaBlock = resolvedMedia.length > 0 ? (
    <View style={styles.photoWrapper}>
      <PhotoFeed
        post={suggestion}
        scrollX={scrollX}
        currentIndexRef={currentIndexRef}
        onOpenFullScreen={onOpenFullScreen}
      />
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
  ) : (
    <View>
      <PhotoItem
        photo={suggestion}      // uses url/uri/bannerUrl
        reviewItem={suggestion} // animation key
        index={0}
        isInteractive={true}
        onOpenFullScreen={onOpenFullScreen}
      />
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

  return (
    <>
      {mediaBlock}
      <SuggestionDetailsModal
        visible={detailsModalVisible}
        onClose={() => setDetailsModalVisible(false)}
        suggestion={suggestionContent}
      />
    </>
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
