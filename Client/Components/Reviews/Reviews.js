import React, { useState, useRef, useEffect } from "react";
import {
  Alert,
  FlatList,
  Animated,
  ActivityIndicator,
  Text,
} from "react-native";
import { deleteCheckIn } from "../../Slices/CheckInsSlice";
import { deleteReview, selectUserAndFriendsReviews, setUserAndFriendsReviews, setProfileReviews, selectProfileReviews, setSelectedReview } from "../../Slices/ReviewsSlice";
import { useSelector, useDispatch } from "react-redux";
import { selectUser } from "../../Slices/UserSlice";
import InviteCard from "./InviteCard";
import ReviewItem from "./ReviewItem";
import CheckInItem from "./CheckInItem";
import SuggestionItem from "./SuggestionItem";
import { useLikeAnimations } from "../../utils/LikeHandlers/LikeAnimationContext";
import { handleLikeWithAnimation as sharedHandleLikeWithAnimation } from "../../utils/LikeHandlers";
import { useNavigation } from "@react-navigation/native";
import { selectFollowing, selectFollowRequests } from "../../Slices/friendsSlice";
import SharePostModal from "./SharedPosts/SharePostModal";
import SharedPostItem from "./SharedPosts/SharedPostItem";
import { deleteSharedPost } from "../../Slices/SharedPostsSlice";
import ShareOptionsModal from "./SharedPosts/ShareOptionsModal";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function Reviews({ reviews, viewabilityConfig, onViewableItemsChanged, ListHeaderComponent, hasMore, scrollY, onScroll, onLoadMore, isLoadingMore }) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const following = useSelector(selectFollowing);
  const followRequests = useSelector(selectFollowRequests);
  const [photoTapped, setPhotoTapped] = useState(null);
  const [shareOptionsVisible, setShareOptionsVisible] = useState(false);
  const [shareToFeedVisible, setShareToFeedVisible] = useState(false);
  const [selectedPostForShare, setSelectedPostForShare] = useState(null);
  const lastTapRef = useRef({});
  const [likedAnimations, setLikedAnimations] = useState({});
  const { registerAnimation, getAnimation } = useLikeAnimations();
  const userAndFriendsReviews = useSelector(selectUserAndFriendsReviews);
  const profileReviews = useSelector(selectProfileReviews);

  const userId = user?.id;

  const handleOpenComments = (review) => {
    if (!review) return;
    const sharedPost = review?.original ? true : false;

    navigation.navigate('CommentScreen', {
      reviewId: review._id,
      setSelectedReview,
      handleLikeWithAnimation,
      toggleTaggedUsers,
      likedAnimations,
      lastTapRef,
      photoTapped,
      isSuggestedFollowPost: review.isSuggestedFollowPost ? true : false,
      sharedPost,
    });
  };

  const handleLikeWithAnimation = (review, force = false) => {
    const animation = getAnimation(review._id);
    return sharedHandleLikeWithAnimation({
      postType: review.type,
      postId: review._id,
      review,
      user,
      reviews,
      animation,
      dispatch,
      lastTapRef,
      force,
    });
  };

  const toggleTaggedUsers = (photoKey) => {
    setPhotoTapped(photoTapped === photoKey ? null : photoKey);
  };

  const handleDeletePost = (post) => {
    Alert.alert(
      "Delete Post",
      `Are you sure you want to delete this ${post.type === "review"
        ? "review"
        : post.type === "check-in"
          ? "check-in"
          : post.type === "sharedPost"
            ? "shared post"
            : "post"
      }?`,
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
              if (post.type === "review") {
                await dispatch(deleteReview({ placeId: post.placeId, reviewId: post._id }));
              } else if (post.type === "check-in") {
                await dispatch(deleteCheckIn({ userId, checkInId: post._id }));

                dispatch(setUserAndFriendsReviews(
                  (userAndFriendsReviews || []).filter(p => p._id !== post._id)
                ));

                dispatch(setProfileReviews(
                  (profileReviews || []).filter(p => p._id !== post._id)
                ));
              } else if (post.type === "sharedPost") {
                await dispatch(deleteSharedPost(post._id));

                dispatch(setUserAndFriendsReviews(
                  (userAndFriendsReviews || []).filter(p => p._id !== post._id)
                ));

                dispatch(setProfileReviews(
                  (profileReviews || []).filter(p => p._id !== post._id)
                ));
              } else {
                console.warn("Unsupported post type:", post.type);
              }
            } catch (error) {
              console.error("Error deleting post:", error);
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

  const openShareOptions = (post) => {
    setShareOptionsVisible(true);
    setSelectedPostForShare(post)
  };

  const openShareToFeedModal = () => {
    setShareOptionsVisible(false);
    setShareToFeedVisible(true);
  };

  const handleShareToStory = () => {
    setShareOptionsVisible(false);
    
    navigation.navigate('StoryPreview', {
      post: selectedPostForShare,
    })
  };

  const closeShareOptions = () => {
    setShareOptionsVisible(false);
  };

  const closeShareToFeed = () => {
    setShareToFeedVisible(false);
    setSelectedPostForShare(null);
  };

  useEffect(() => {
    reviews?.forEach(post => {
      if (post?._id) {
        registerAnimation(post._id);
      }
    });
  }, [reviews]);

  return (
    <>
      <AnimatedFlatList
        data={reviews}
        extraData={reviews ?? []}
        keyExtractor={(item, index) => {
          const id = item._id || item.id || index;
          return item.type === 'suggestion' ? `suggestion-${index}` : `${item.type}-${id}`;
        }}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
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
                onShare={openShareOptions}
              />
            )
          }
          if (item.type === "check-in") {
            return (
              <CheckInItem
                item={item}
                animation={getAnimation(item._id)}
                setLikedAnimations={setLikedAnimations}
                photoTapped={photoTapped}
                toggleTaggedUsers={toggleTaggedUsers}
                handleLikeWithAnimation={handleLikeWithAnimation}
                handleLike={handleLikeWithAnimation}
                handleOpenComments={handleOpenComments}
                lastTapRef={lastTapRef}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
                following={following}
                followRequests={followRequests}
                onShare={openShareOptions}
              />
            );
          }
          if (item.type === "suggestion") {
            return (
              <SuggestionItem
                suggestion={item}
                onShare={openShareOptions}
              />
            );
          }
          if (item.type === "sharedPost") {
            return (
              <SharedPostItem
                item={item}
                animation={getAnimation(item._id)}
                setLikedAnimations={setLikedAnimations}
                photoTapped={photoTapped}
                toggleTaggedUsers={toggleTaggedUsers}
                handleLikeWithAnimation={handleLikeWithAnimation}
                handleLike={handleLikeWithAnimation}
                handleOpenComments={handleOpenComments}
                lastTapRef={lastTapRef}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
                following={following}
                followRequests={followRequests}
                onShare={openShareOptions}
              />
            );
          }
          return (
            <ReviewItem
              item={item}
              animation={getAnimation(item._id)}
              photoTapped={photoTapped}
              toggleTaggedUsers={toggleTaggedUsers}
              handleLikeWithAnimation={handleLikeWithAnimation}
              handleOpenComments={handleOpenComments}
              lastTapRef={lastTapRef}
              handleDelete={handleDeletePost}
              handleEdit={handleEditPost}
              following={following}
              followRequests={followRequests}
              onShare={openShareOptions}
            />
          );
        }}
      />
      <SharePostModal
        visible={shareToFeedVisible}
        onClose={closeShareToFeed}
        post={selectedPostForShare}
      />
      <ShareOptionsModal 
        visible={shareOptionsVisible}
        onClose={closeShareOptions}
        onShareToFeed={openShareToFeedModal}
        onShareToStory={handleShareToStory}
      />
    </>
  )
};