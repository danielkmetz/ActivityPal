import React, { useState, useRef } from "react";
import { View, StyleSheet, TouchableWithoutFeedback } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { selectUser } from "../../../Slices/UserSlice";
import { useDispatch, useSelector } from "react-redux";
import LikeButton from "./LikeButton";
import CommentButton from "./CommentButton";
import SendButton from './SendButton';
import ShareButton from './ShareButton';
import { medium } from "../../../utils/Haptics/haptics";
import TagUserModal from '../TagUserModal/TagUserModal';
import { setSelectedReview } from "../../../Slices/ReviewsSlice";
import { useLikeAnimations } from "../../../utils/LikeHandlers/LikeAnimationContext";
import { pickPostId, typeFromKind as promoEventKind } from "../../../utils/posts/postIdentity";
import { handleEventOrPromoLike } from "../../../utils/LikeHandlers/promoEventLikes";
import { getEngagementTarget, logEngagementIfNeeded } from "../../../Slices/EngagementSlice";
import { handleLikeWithAnimation as sharedHandleLikeWithAnimation } from "../../../utils/LikeHandlers";

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
  post,
  onShare,
  toggleTaggedUsers,
  photo,
  isCommentScreen = false,
  orientation = "row",
  onRequestShowTags,          // preferred deterministic show: (photoKey) => void
  setPhotoTapped,
  embeddedInShared = false, 
}) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const postContent = post?.original ?? post ?? {};
  const lastTapRef = useRef({});
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const currentUserId = user?.id;
  const { hasLiked, count } = deriveLikeState(post, currentUserId);
  const { getAnimation } = useLikeAnimations(); // ✅ use context
  const taggedUsers = Array.isArray(photo?.taggedUsers) ? photo.taggedUsers : [];
  const postType = post?.type || post?.postType;
  const isEventPromoOrSuggestion = postType === 'suggestion' || postType === 'promo' || postType === 'promotion' || postType === 'event';
  const shouldRenderTagButton =
    postContent?.type !== "invite" && photo?.taggedUsers?.length > 0;

  const handleSend = () => {
    medium();
    const kind = postContent?.kind?.toLowerCase();
    const derivedType = kind?.includes("event")
      ? "event"
      : kind?.includes("promo")
        ? "promotion"
        : postContent?.type;

    navigation.navigate("SearchFollowing", {
      postId: postContent._id,
      postType: derivedType,
      placeId: postContent.placeId || postContent.business?.placeId || null,
    });
  };

  const openTagModal = () => {
    if (!photo?.photoKey) return;
    medium();
    if (typeof onRequestShowTags === "function") {
      onRequestShowTags(photo.photoKey);   // deterministic "show"
    } else {
      toggleTaggedUsers?.(photo.photoKey); // fallback "toggle"
    }
    setTagModalVisible(true);
  };

  const closeTagModal = () => {
    setTagModalVisible(false);
    setPhotoTapped?.(null);
  };

  const handleLikeWithAnimation = (force = false) => {
    const animation = getAnimation(postContent._id);
    const resolvedPostId = pickPostId(post);
    const promoEventType =
      (postContent?.type && String(post.type).toLowerCase()) ||
      promoEventKind(postContent?.kind) ||
      (postContent?.__typename && String(postContent.__typename).toLowerCase());

    if (promoEventType === 'promotion' || promoEventType === 'event') {
      return handleEventOrPromoLike({
        postType: promoEventType || 'suggestion', // or pass 'event'/'promotion' explicitly if you know it
        kind: post.kind,
        postId: resolvedPostId,
        review: post,
        user,
        animation,
        dispatch,
        lastTapRef,
        force,
      })
    } else {
      return sharedHandleLikeWithAnimation({
        postType: post.type,
        postId: resolvedPostId,
        review: post,
        user,
        animation,
        dispatch,
        lastTapRef,
        force,
      });
    }
  };

  const navigateToCommentsScreen = (post) => {
    if (!post) return;
    medium();
    const sharedPost = post?.original ? true : false;

    navigation.navigate('CommentScreen', {
      reviewId: post._id,
      setSelectedReview,
      isSuggestedFollowPost: post.isSuggestedFollowPost ? true : false,
      sharedPost,
    });
  }

  const navigateToEventPromoComments = (post) => {
    const { targetType, targetId } = getEngagementTarget(post);
    medium();

    logEngagementIfNeeded(dispatch, {
      targetType,
      targetId,
      placeId: post.placeId,
      engagementType: 'click',
    });

    navigation.navigate('EventDetails', { activity: post });
  }

  const handleOpenComments = (post) => {
    if (isEventPromoOrSuggestion) {
      navigateToEventPromoComments(post);
    } else {
      navigateToCommentsScreen(post);
    }
  };

  if (embeddedInShared) return null;

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
          onPress={() => handleLikeWithAnimation(post, { force: true })}
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
              count={post?.comments?.length || 0}
              onPress={() => handleOpenComments(post)}
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
            onPress={() => onShare(postContent)}
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
          onPress={openTagModal}
        >
          <View style={styles.tagIcon}>
            <MaterialCommunityIcons name="tag" size={24} color="white" />
          </View>
        </TouchableWithoutFeedback>
      )}
      <TagUserModal
        visible={tagModalVisible}
        post={post}
        photoId={photo?._id}
        onClose={closeTagModal}
        taggedUsers={taggedUsers}
        title="Tagged in this photo"
      />
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
    right: 5,
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
