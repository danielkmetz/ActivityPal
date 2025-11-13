import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  Alert,
  FlatList,
  Animated,
  ActivityIndicator,
  Text,
} from "react-native";
import { deletePost } from "../../Slices/PostsSlice";
import { useDispatch } from "react-redux";
import InviteCard from "./InviteCard";
import ReviewItem from "./ReviewItem";
import CheckInItem from "./CheckInItem";
import SuggestionItem from "./SuggestionItem";
import { useNavigation } from "@react-navigation/native";
import SharePostModal from "./SharedPosts/SharePostModal";
import SharedPostItem from "./SharedPosts/SharedPostItem";
import ShareOptionsModal from "./SharedPosts/ShareOptionsModal";
import LiveStreamCard from '../LiveStream/LiveStreamCard';
import { medium } from "../../utils/Haptics/haptics";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function Reviews({ reviews, viewabilityConfig, onViewableItemsChanged, ListHeaderComponent, hasMore, scrollY, onScroll, onLoadMore, isLoadingMore }) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const [photoTapped, setPhotoTapped] = useState(null);
  const [shareOptionsVisible, setShareOptionsVisible] = useState(false);
  const [shareToFeedVisible, setShareToFeedVisible] = useState(false);
  const [selectedPostForShare, setSelectedPostForShare] = useState(null);
  const [editingSharedPost, setEditingSharedPost] = useState(false);
  const listHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const momentumGuardRef = useRef(false);
  const lastLoadTsRef = useRef(0);

  const MIN_COOLDOWN_MS = 1000;   // don't load again within 1s
  const MIN_CONTENT_RATIO = 1.05; // content must be > viewport by 5%
  const MIN_DISTANCE_PX = 80;     // require some distance from end
  const shouldUseViewability = typeof onViewableItemsChanged === "function";
  const pagingEnabled = typeof onLoadMore === "function";
  const hasMoreEffective = pagingEnabled && hasMore === true;
  const isLoadingMoreEffective = pagingEnabled && isLoadingMore === true;

  const safeViewabilityConfig = useMemo(() => {
    if (!shouldUseViewability) return undefined;

    const cfg = viewabilityConfig ?? {};
    const hasItem = cfg.itemVisiblePercentThreshold != null;
    const hasArea = cfg.viewAreaCoveragePercentThreshold != null;

    if (hasItem && hasArea) {
      // keep itemVisible, clear area
      const { viewAreaCoveragePercentThreshold, ...rest } = cfg;
      return { ...rest, viewAreaCoveragePercentThreshold: undefined };
    }
    if (hasItem && !hasArea) {
      // clear area explicitly to override RN default
      return { ...cfg, viewAreaCoveragePercentThreshold: undefined };
    }
    if (!hasItem && hasArea) {
      // clear item explicitly to override RN default
      return { ...cfg, itemVisiblePercentThreshold: undefined };
    }
    // neither provided: pick one explicit default
    return { itemVisiblePercentThreshold: 60, viewAreaCoveragePercentThreshold: undefined };
  }, [viewabilityConfig, shouldUseViewability]);

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
              await dispatch(deletePost({ postId: post._id }));
              
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

  return (
    <>
      <AnimatedFlatList
        data={reviews}
        extraData={reviews ?? []}
        keyExtractor={(item, index) => {
          const id = item._id || item.id || index;
          return item.type === 'suggestion' ? `suggestion-${index}` : `${item.type}-${id}`;
        }}
        viewabilityConfig={shouldUseViewability ? safeViewabilityConfig : undefined}
        onViewableItemsChanged={shouldUseViewability ? onViewableItemsChanged : undefined}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.2} // Triggers when user scrolls within 50% of bottom
        onMomentumScrollBegin={handleMomentumBegin}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        ListFooterComponent={
          pagingEnabled
            ? (isLoadingMoreEffective
              ? <ActivityIndicator size="small" style={{ marginVertical: 10 }} />
              : (!hasMoreEffective
                ? <Text style={{ textAlign: "center", color: "gray", marginVertical: 20 }}>
                  🎉 You’re all caught up!
                </Text>
                : null))
            : null
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
                onShare={openShareOptions}
              />
            )
          }
          if (item.type === "check-in") {
            return (
              <CheckInItem
                item={item}
                photoTapped={photoTapped}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
                onShare={openShareOptions}
                setPhotoTapped={setPhotoTapped}
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
                photoTapped={photoTapped}
                setPhotoTapped={setPhotoTapped}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
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
              />
            )
          }
          return (
            <ReviewItem
              item={item}
              photoTapped={photoTapped}
              setPhotoTapped={setPhotoTapped}
              handleDelete={handleDeletePost}
              handleEdit={handleEditPost}
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