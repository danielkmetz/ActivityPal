import React, { useState, useRef, useEffect , useCallback } from "react";
import {
  Alert,
  FlatList,
  Animated,
  ActivityIndicator,
  Text,
} from "react-native";
import { deleteCheckIn } from "../../Slices/CheckInsSlice";
import { deleteReview, removePostFromFeeds, setSelectedReview } from "../../Slices/ReviewsSlice";
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
import LiveStreamCard from '../LiveStream/LiveStreamCard';
import { unpostLiveSession } from "../../Slices/LiveStreamSlice";
import { medium } from "../../utils/Haptics/haptics";

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
  const [editingSharedPost, setEditingSharedPost] = useState(false);
  const lastTapRef = useRef({});
  const { registerAnimation, getAnimation } = useLikeAnimations();
  const userId = user?.id;

  const listHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const momentumGuardRef = useRef(false);
  const lastLoadTsRef = useRef(0);

  const MIN_COOLDOWN_MS = 1000;   // don't load again within 1s
  const MIN_CONTENT_RATIO = 1.05; // content must be > viewport by 5%
  const MIN_DISTANCE_PX = 80;     // require some distance from end

  const canLoadMoreNow = useCallback((distanceFromEnd) => {
    if (!hasMore || isLoadingMore) return false;
    if (momentumGuardRef.current) return false;

    const now = Date.now();
    if (now - lastLoadTsRef.current < MIN_COOLDOWN_MS) return false;

    const viewport = listHeightRef.current || 0;
    const content = contentHeightRef.current || 0;
    if (content < viewport * MIN_CONTENT_RATIO) return false;

    if (typeof distanceFromEnd === 'number' && distanceFromEnd < MIN_DISTANCE_PX) {
      return false;
    }

    return true;
  }, [hasMore, isLoadingMore]);

  const handleEndReached = useCallback(({ distanceFromEnd }) => {
    if (!canLoadMoreNow(distanceFromEnd)) return;
    lastLoadTsRef.current = Date.now();
    momentumGuardRef.current = true; // one fire per momentum
    onLoadMore?.();
  }, [canLoadMoreNow, onLoadMore]);

  const handleMomentumBegin = useCallback(() => {
    momentumGuardRef.current = false; // reset at new momentum
  }, []);

  const handleLayout = useCallback((e) => {
    listHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  const handleContentSizeChange = useCallback((_w, h) => {
    contentHeightRef.current = h;
  }, []);
  // ---------------------------------

  const handleOpenComments = (review) => {
    if (!review) return;
    medium();
    const sharedPost = review?.original ? true : false;

    navigation.navigate('CommentScreen', {
      reviewId: review._id,
      setSelectedReview,
      toggleTaggedUsers,
      lastTapRef,
      photoTapped,
      isSuggestedFollowPost: review.isSuggestedFollowPost ? true : false,
      sharedPost,
    });
  };

  const handleLikeWithAnimation = (entity, opts = {}) => {
    const { force = false, animateTarget = null } = opts;
    const animKey = (animateTarget?._id) || entity?._id || entity?.id;
    const animation = getAnimation(animKey);

    return sharedHandleLikeWithAnimation({
      postType: entity?.type,
      kind: entity?.kind,
      postId: entity?._id || entity?.id,
      review: entity,         // the thing whose likes/owner we reason about
      user,
      animation,              // Animated.Value looked up by the animation target
      dispatch,
      lastTapRef,
      force,
      animateTarget,          // NEW: tells the helper where to overlay
    });
  };

  const toggleTaggedUsers = (photoKey) => {
    setPhotoTapped(photoTapped === photoKey ? null : photoKey);
  };

  const handleDeletePost = (post) => {
    const typeLabels = {
      review: "review",
      "check-in": "check-in",
      sharedPost: "shared post",
      liveStream: "live stream",
    };

    const label = typeLabels[post.type] || "post";

    Alert.alert(
      "Delete Post",
      `Are you sure you want to delete this ${label}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              switch (post.type) {
                case "review":
                  await dispatch(deleteReview({ placeId: post.placeId, reviewId: post._id }));
                  break;
                case "check-in":
                  await dispatch(deleteCheckIn({ userId, checkInId: post._id }));
                  break;
                case "sharedPost":
                  await dispatch(deleteSharedPost(post._id));
                  break;
                case "liveStream":
                  await dispatch(unpostLiveSession({ liveId: post._id, removeLinkedPost: true }));
                  break;
                default:
                  console.warn("Unsupported post type:", post.type);
                  return;
              }

              await dispatch(removePostFromFeeds(post._id));
              medium();
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

    const lowerType = post.type.toLowerCase();

    if (lowerType === "review" || lowerType === "check-in") {
      navigation.navigate("CreatePost", {
        postType: post.type,
        isEditing: true,
        initialPost: post,
      });
    } else if (lowerType === "sharedpost" || lowerType === "shared" || lowerType === "livestream") {
      setEditingSharedPost(true);
      setSelectedPostForShare(post);
      setShareToFeedVisible(true);
    } else {
      console.warn("Unsupported post type for editing:", post.type);
    }
  };

  const openShareOptions = (post) => {
    setShareOptionsVisible(true);
    setSelectedPostForShare(post);
    medium();
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
      if (post?._id) registerAnimation(post._id);
      // If it's a shared post, also register the inner/original
      if (post?.type === 'sharedPost' && post?.original?._id) {
        registerAnimation(post.original._id);
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
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.2} // Triggers when user scrolls within 50% of bottom
        onMomentumScrollBegin={handleMomentumBegin}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
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
                setPhotoTapped={setPhotoTapped}
              />
            );
          }
          if (item.type === "suggestion") {
            return (
              <SuggestionItem
                suggestion={item}
                handleLikeWithAnimation={handleLikeWithAnimation}
                onShare={openShareOptions}
              />
            );
          }
          if (item.type === "sharedPost") {
            return (
              <SharedPostItem
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
          }
          if (item.type === "liveStream") {
            return (
              <LiveStreamCard
                live={item}
                onProfile={(userId) => navigation.navigate('OtherUserProfile', { userId })}
                handleEdit={handleEditPost}
                handleDelete={handleDeletePost}
                handleLikeWithAnimation={handleLikeWithAnimation}
                handleOpenComments={handleOpenComments}
              />
            )
          }
          return (
            <ReviewItem
              item={item}
              animation={getAnimation(item._id)}
              photoTapped={photoTapped}
              setPhotoTapped={setPhotoTapped}
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
        isEditing={editingSharedPost}
        setIsEditing={setEditingSharedPost}
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