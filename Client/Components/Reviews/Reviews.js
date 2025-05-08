import React, { useState, useRef } from "react";
import {
  Alert,
  FlatList,
  Animated,
  ActivityIndicator,
  Text,
} from "react-native";
import { deleteCheckIn } from "../../Slices/CheckInsSlice";
import { toggleLike, deleteReview, selectUserAndFriendsReviews, setUserAndFriendsReviews, setProfileReviews, selectProfileReviews } from "../../Slices/ReviewsSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import CommentModal from "./CommentModal";
import { createNotification } from "../../Slices/NotificationsSlice";
import InviteCard from "./InviteCard";
import ReviewItem from "./ReviewItem";
import CheckInItem from "./CheckInItem";
import EditPostModal from "./EditPostModal";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function Reviews({ reviews, ListHeaderComponent, hasMore, scrollY, onScroll, onLoadMore, isLoadingMore }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const [selectedReview, setSelectedReview] = useState(null); // For the modal
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [photoTapped, setPhotoTapped] = useState(null);
  const lastTapRef = useRef({});
  const [likedAnimations, setLikedAnimations] = useState({});
  const [editingReview, setEditingReview] = useState(null); // holds the review being edited
  const [showEditModal, setShowEditModal] = useState(false);
  const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
  const profileReviews = useSelector(selectProfileReviews);

  const userId = user?.id
  const fullName = `${user?.firstName} ${user?.lastName}`;

  const handleOpenComments = (review) => {
    if (!review) return;
    setSelectedReview({ ...review });  // clone to force re-render freshness
    setCommentModalVisible(true);
  };

  const handleLike = async (postType, postId) => {
    // Determine where to find the post (reviews for businesses, check-ins for users)
    const postToUpdate = reviews.find((review) => review._id === postId);

    if (!postToUpdate) {
      console.error(`${postType} with ID ${postId} not found.`);
      return;
    }

    const placeId = postToUpdate.placeId;

    try {
      // Sync with the backend
      const { payload } = await dispatch(toggleLike({ postType, placeId, postId, userId, fullName }));

      // Check if the current user's ID exists in the likes array before sending a notification
      const userLiked = payload?.likes?.some((like) => like.userId === userId);

      // Dynamically get ownerId based on postType
      let ownerId;
      if (postType === 'invite') {
        ownerId = postToUpdate.sender?.id || postToUpdate.senderId;
      } else {
        ownerId = postToUpdate.userId;
      }

      // Create a notification for the post owner
      if (userLiked && ownerId !== userId) { // Avoid self-notifications
        await dispatch(createNotification({
          userId: ownerId,
          type: 'like',
          message: `${fullName} liked your ${postType}.`,
          relatedId: userId,
          typeRef: postType === 'review' ? 'Review' : postType === 'check-in' ? 'CheckIn' : 'ActivityInvite',
          targetId: postId,
          postType,
        }));
      }
    } catch (error) {
      console.error(`Error toggling like for ${postType}:`, error);
    }
  };

  const handleLikeWithAnimation = async (postType, postId, force = false) => {
    const now = Date.now();
  
    if (!lastTapRef.current || typeof lastTapRef.current !== "object") {
      lastTapRef.current = {};
    }
  
    const postBeforeUpdate = reviews.find((review) => review._id === postId);
    const wasLikedBefore = postBeforeUpdate?.likes?.some((like) => like.userId === user?.id);
  
    const shouldAnimate = force || (now - (lastTapRef.current[postId] || 0) < 300);
  
    if (shouldAnimate) {
      await handleLike(postType, postId);
  
      if (!wasLikedBefore) {
        if (!likedAnimations[postId]) {
          likedAnimations[postId] = new Animated.Value(0);
          setLikedAnimations({ ...likedAnimations });
        }
  
        const animation = likedAnimations[postId];
  
        Animated.timing(animation, {
          toValue: 1,
          duration: 50,
          useNativeDriver: true,
        }).start(() => {
          setTimeout(() => {
            Animated.timing(animation, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }).start();
          }, 500);
        });
  
        setLikedAnimations((prev) => ({
          ...prev,
          [postId]: animation,
        }));
      }
    }
  
    lastTapRef.current[postId] = now;
  };  
  
  const toggleTaggedUsers = (photoKey) => {
    setPhotoTapped(photoTapped === photoKey ? null : photoKey);
  };

  const handleDeletePost = (post) => {
    Alert.alert(
      "Delete Post",
      `Are you sure you want to delete this ${post.type === "review" ? "review" : "check-in"}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (post.type === 'review') {
                await dispatch(deleteReview({ placeId: post.placeId, reviewId: post._id }));
              } else if (post.type === 'check-in') {
                await dispatch(deleteCheckIn({ userId, checkInId: post._id }));

                dispatch(setUserAndFriendsReviews(
                  (userAndFriendsReviews || []).filter(p => p._id !== post._id)
                ));

                dispatch(setProfileReviews(
                  (profileReviews || []).filter(p => p._id !== post._id)
                ));
              } else {
                console.warn('Unsupported post type:', post.type);
              }
            } catch (error) {
              console.error('Error deleting post:', error);
              Alert.alert("Error", "Something went wrong while deleting the post.");
            }
          },
        },
      ]
    );
  };

  const handleEditPost = async (post, updates) => {
    if (post.type === 'review') {
      setEditingReview(post);
      setShowEditModal(true);
      return; // We skip dispatching here — it's done after modal submission
    }

    try {
      if (post.type === 'check-in') {
        setEditingReview(post);
        setShowEditModal(true);
        return;
      } else {
        console.warn("Unsupported post type for editing:", post.type);
      }
    } catch (error) {
      console.error("Error editing post:", error);
    }
  };

  return (
    <>
      <AnimatedFlatList
        data={reviews}
        extraData={reviews ?? []}
        keyExtractor={(item, index) =>
          `${item.type}-${item._id || item.id || index}`
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        onEndReached={() => {
          if (hasMore && !isLoadingMore) {
            onLoadMore?.();
          }
        }}
        onEndReachedThreshold={0.5} // Triggers when user scrolls within 50% of bottom
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator size="small" style={{ marginVertical: 10 }} />
          ) : !hasMore ? (
            <Text style={{ textAlign: "center", color: "gray", marginVertical: 20 }}>
              🎉 You’re all caught up!
            </Text>
          ) : null
        }
        onScroll={
          scrollY
            ? Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              {
                useNativeDriver: true,
                listener: onScroll,
              }
            )
            : onScroll || undefined
        }
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          if (item.type === 'invite') {
            return (
              <InviteCard
                invite={item}
                handleLike={handleLike}
                handleOpenComments={handleOpenComments}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
              />
            )
          }

          if (item.type === "check-in") {
            return (
              <CheckInItem
                item={item}
                likedAnimations={likedAnimations}
                photoTapped={photoTapped}
                toggleTaggedUsers={toggleTaggedUsers}
                handleLikeWithAnimation={handleLikeWithAnimation}
                handleLike={handleLike}
                handleOpenComments={handleOpenComments}
                lastTapRef={lastTapRef}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
              />
            );
          }
          return (
            <ReviewItem
              item={item}
              likedAnimations={likedAnimations}
              photoTapped={photoTapped}
              toggleTaggedUsers={toggleTaggedUsers}
              handleLikeWithAnimation={handleLikeWithAnimation}
              handleLike={handleLike}
              handleOpenComments={handleOpenComments}
              lastTapRef={lastTapRef}
              handleDelete={handleDeletePost}
              handleEdit={handleEditPost}
            />
          );
        }}
      />
      
      <CommentModal
        visible={commentModalVisible}
        review={selectedReview}
        setSelectedReview={setSelectedReview}
        reviews={reviews}
        likedAnimations={likedAnimations}
        handleLikeWithAnimation={handleLikeWithAnimation}
        toggleTaggedUsers={toggleTaggedUsers}
        lastTapRef={lastTapRef}
        photoTapped={photoTapped}
        setCommentModalVisible={setCommentModalVisible}
      />

      <EditPostModal
        visible={showEditModal}
        post={editingReview}
        showEditModal={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingReview(null);
        }}
        setShowEditModal={setShowEditModal}
        setEditingReview={setEditingReview}
      />
    </>
  )
};