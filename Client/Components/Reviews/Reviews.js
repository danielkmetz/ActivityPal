import React, { useState, useRef } from "react";
import {
  Alert,
  FlatList,
  Animated,
  ActivityIndicator,
  Text,
} from "react-native";
import { deleteCheckIn } from "../../Slices/CheckInsSlice";
import { deleteReview, selectUserAndFriendsReviews, setUserAndFriendsReviews, setProfileReviews, selectProfileReviews } from "../../Slices/ReviewsSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import CommentModal from "./CommentModal";
import InviteCard from "./InviteCard";
import ReviewItem from "./ReviewItem";
import CheckInItem from "./CheckInItem";
import EditPostModal from "./EditPostModal";
import { handleLikeWithAnimation as sharedHandleLikeWithAnimation } from "../../utils/LikeHandlers";
import { useNavigation } from "@react-navigation/native";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function Reviews({ reviews, ListHeaderComponent, hasMore, scrollY, onScroll, onLoadMore, isLoadingMore }) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [photoTapped, setPhotoTapped] = useState(null);
  const lastTapRef = useRef({});
  const [likedAnimations, setLikedAnimations] = useState({});
  const [editingReview, setEditingReview] = useState(null); // holds the review being edited
  const [showEditModal, setShowEditModal] = useState(false);
  const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
  const profileReviews = useSelector(selectProfileReviews);

  const userId = user?.id
  
  const handleOpenComments = (review) => {
    if (!review) return;
    setCommentsVisible(true);
    setSelectedReview(review);
  };

  const handleCloseComments = () => {
    setCommentsVisible(false);
    setSelectedReview(null);
  };

  const handleLikeWithAnimation = (review, force = false) => {
    return sharedHandleLikeWithAnimation({
      postType: review.type,
      postId: review._id,
      review,
      user,
      reviews,
      dispatch,
      lastTapRef,
      likedAnimations,
      setLikedAnimations,
      force,
    });
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

  const handleEditPost = (post) => {
    if (!post || !post.type) {
      console.warn("Invalid post object passed to handleEditPost");
      return;
    }

    if (post.type === "review" || post.type === "check-in") {
      navigation.navigate("CreatePost", {
        postType: post.type,
        isEditing: true,
        initialPost: post,
      });
    } else {
      console.warn("Unsupported post type for editing:", post.type);
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
                handleLikeWithAnimation={handleLikeWithAnimation}
                handleOpenComments={handleOpenComments}
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
                handleLike={handleLikeWithAnimation}
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
              handleOpenComments={handleOpenComments}
              lastTapRef={lastTapRef}
              handleDelete={handleDeletePost}
              handleEdit={handleEditPost}
            />
          );
        }}
      />
      <CommentModal
        visible={commentsVisible}
        onClose={handleCloseComments}
        review={selectedReview}
        reviews={reviews}
        setSelectedReview={setSelectedReview}
        likedAnimations={likedAnimations}
        handleLikeWithAnimation={handleLikeWithAnimation}
        toggleTaggedUsers={toggleTaggedUsers}
        lastTapRef={lastTapRef}
        photoTapped={photoTapped}
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