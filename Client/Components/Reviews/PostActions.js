import React from "react";
import { View, StyleSheet, TouchableWithoutFeedback } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { selectUser } from "../../Slices/UserSlice";
import { useSelector } from "react-redux";
import LikeButton from "./PostActions/LikeButton";
import CommentButton from "./PostActions/CommentButton";
import SendButton from './PostActions/SendButton';
import ShareButton from './PostActions/ShareButton';

function deriveLikeState(item, currentUserId) {
  // Normalize possible shapes:
  // - item.likes: array of { userId, ... }
  // - item.likesCount: number
  // - item.liked / item.likedByMe: boolean
  // - (sometimes likes may be missing or an object)
  const likesArray =
    Array.isArray(item?.likes) ? item.likes
    : Array.isArray(item?.likes?.items) ? item.likes.items
    : [];

  const count =
    typeof item?.likesCount === 'number' ? item.likesCount
    : Array.isArray(likesArray) ? likesArray.length
    : 0;

  const hasLiked =
    typeof item?.liked === 'boolean' ? item.liked
    : typeof item?.likedByMe === 'boolean' ? item.likedByMe
    : Array.isArray(likesArray)
      ? likesArray.some(like => String(like?.userId) === String(currentUserId))
      : false;

  return { hasLiked, count };
}

export default function PostActions({
  item,
  onShare,
  handleLikeWithAnimation,
  handleOpenComments,
  toggleTaggedUsers,
  photo,
  isCommentScreen = false,
  orientation = "row",
}) {
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const currentUserId = user?.id;
  const { hasLiked, count } = deriveLikeState(item, currentUserId);
  const shouldRenderTagButton =
    item?.type !== "invite" && photo?.taggedUsers?.length > 0;

  const handleSend = () => {
    const kind = item?.kind?.toLowerCase();
    const derivedType = kind?.includes("event")
      ? "event"
      : kind?.includes("promo")
        ? "promotion"
        : item?.type;

    navigation.navigate("SearchFollowing", {
      postId: item._id,
      postType: derivedType,
      placeId: item.placeId || item.business?.placeId || null,
    });
  };

  return (
    <View
      style={[
        styles.actionsContainer,
        orientation === "column" && styles.actionsContainerColumn,
      ]}
    >
      <View
        style={[
          styles.actionButtons,
          orientation === "column"
            ? styles.actionButtonsColumn
            : styles.actionButtonsRow,
        ]}
      >
        {/* Like */}
        <LikeButton
          hasLiked={hasLiked}
          count={count}
          onPress={() => handleLikeWithAnimation(item, { force: true })}
          orientation={orientation}
        />
        {/* Comment */}
        {!isCommentScreen && (
          <View
            style={[
              styles.actionItem,
              orientation === "column" && styles.actionItemColumn,
            ]}
          >
            <CommentButton
              count={item?.comments?.length || 0}
              onPress={() => handleOpenComments(item)}
              orientation={orientation}
            />
          </View>
        )}
        {/* Share */}
        <View
          style={[
            styles.actionItem,
            orientation === "column" && styles.actionItemColumn,
          ]}
        >
          <ShareButton
            onPress={() => onShare(item)}
            orientation={orientation}
          />
        </View>
        {/* Send */}
        <View
          style={[
            styles.actionItem,
            orientation === "column" && styles.actionItemColumn,
          ]}
        >
          <SendButton
            onPress={handleSend}
            orientation={orientation}
          />
        </View>
      </View>
      {/* Tagged Users Button (row mode only) */}
      {shouldRenderTagButton && orientation !== "column" && (
        <TouchableWithoutFeedback
          onPress={() => toggleTaggedUsers(photo.photoKey)}
        >
          <View style={styles.tagIcon}>
            <MaterialCommunityIcons name="tag" size={24} color="white" />
          </View>
        </TouchableWithoutFeedback>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionsContainerColumn: {
    position: "absolute",
    right: 20,
    top: "45%",
    transform: [{ translateY: -50 }],
    zIndex: 10,
  },
  actionButtons: {
    alignItems: "center",
    justifyContent: "space-around",
  },
  actionButtonsRow: {
    width: "100%",
    flexDirection: "row",
  },
  actionButtonsColumn: {
    flexDirection: "column",
    gap: 20,
  },
  actionItem: {
    marginHorizontal: 10,
  },
  actionItemColumn: {
    marginVertical: 10,
    alignItems: "center",
  },
  tagIcon: {
    position: "absolute",
    bottom: 40,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 6,
    borderRadius: 20,
  },
});
