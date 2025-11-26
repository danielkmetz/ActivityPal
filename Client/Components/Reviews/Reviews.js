import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Alert, FlatList, Animated, ActivityIndicator, Text } from 'react-native';
import { useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { deletePost } from '../../Slices/PostsSlice';
import { logEngagementIfNeeded } from '../../Slices/EngagementSlice';
import InviteCard from './InviteCard';
import ReviewItem from './ReviewItem';
import CheckInItem from './CheckInItem';
import SuggestionItem from './SuggestionItem';
import SharedPostItem from './SharedPosts/SharedPostItem';
import SharePostModal from './SharedPosts/SharePostModal';
import { medium } from '../../utils/Haptics/haptics';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

export default function Reviews({
  reviews,
  ListHeaderComponent,
  hasMore,
  scrollY,
  onScroll,
  onLoadMore,
  isLoadingMore,
}) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const [photoTapped, setPhotoTapped] = useState(null);
  const [shareToFeedVisible, setShareToFeedVisible] = useState(false);
  const [selectedPostForShare, setSelectedPostForShare] = useState(null);
  const [editingSharedPost, setEditingSharedPost] = useState(false);
  const [activePostId, setActivePostId] = useState(null);
  const seenTodayRef = useRef(new Set());
  const listHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const momentumGuardRef = useRef(false);
  const lastLoadTsRef = useRef(0);

  /* -------------------- Viewability (active post + engagement) ------------------- */

  const baseViewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 60,
      viewAreaCoveragePercentThreshold: undefined,
    }),
    []
  );

  const safeViewabilityConfig = useMemo(() => {
    const cfg = baseViewabilityConfig || {};
    const hasItem = cfg.itemVisiblePercentThreshold != null;
    const hasArea = cfg.viewAreaCoveragePercentThreshold != null;

    if (hasItem && hasArea) {
      const { viewAreaCoveragePercentThreshold, ...rest } = cfg;
      return { ...rest, viewAreaCoveragePercentThreshold: undefined };
    }
    if (hasItem && !hasArea) {
      return { ...cfg, viewAreaCoveragePercentThreshold: undefined };
    }
    if (!hasItem && hasArea) {
      return { ...cfg, itemVisiblePercentThreshold: undefined };
    }
    return {
      itemVisiblePercentThreshold: 60,
      viewAreaCoveragePercentThreshold: undefined,
    };
  }, [baseViewabilityConfig]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (!Array.isArray(viewableItems) || viewableItems.length === 0) return;

    // 1) Decide which post is “active” (first visible item)
    const topItem = viewableItems[0]?.item;
    if (topItem) {
      const id = topItem._id || topItem.id || topItem.postId;
      setActivePostId(id || null);
    }

    // 2) Log engagement views for suggestion cards
    viewableItems.forEach(({ item: data }) => {
      if (!data || data.type !== 'suggestion') return;

      const placeId = data?.placeId;
      let targetId = null;
      let targetType = null;

      const kind = (data.kind || '').toLowerCase();

      if (kind.includes('event')) {
        targetType = 'event';
        targetId = data._id;
      } else if (kind.includes('promo')) {
        targetType = 'promo';
        targetId = data._id;
      } else {
        targetType = 'place';
        targetId = data.placeId;
      }

      const engagementKey = `${targetType}:${targetId}`;
      if (targetId && targetType && !seenTodayRef.current.has(engagementKey)) {
        seenTodayRef.current.add(engagementKey);
        logEngagementIfNeeded(dispatch, {
          targetType,
          targetId,
          placeId,
          engagementType: 'view',
        });
      }
    });
  }).current;

  /* -------------------------- Infinite scroll controls -------------------------- */

  const MIN_COOLDOWN_MS = 1000;
  const MIN_CONTENT_RATIO = 1.05;
  const MIN_DISTANCE_PX = 80;
  const pagingEnabled = typeof onLoadMore === 'function';
  const hasMoreEffective = pagingEnabled && hasMore === true;
  const isLoadingMoreEffective = pagingEnabled && isLoadingMore === true;

  const canLoadMoreNow = useCallback(
    (distanceFromEnd) => {
      if (!hasMore || isLoadingMore) return false;
      if (momentumGuardRef.current) return false;

      const now = Date.now();
      if (now - lastLoadTsRef.current < MIN_COOLDOWN_MS) return false;

      const viewport = listHeightRef.current || 0;
      const content = contentHeightRef.current || 0;
      if (content < viewport * MIN_CONTENT_RATIO) return false;

      if (
        typeof distanceFromEnd === 'number' &&
        distanceFromEnd < MIN_DISTANCE_PX
      ) {
        return false;
      }

      return true;
    },
    [hasMore, isLoadingMore]
  );

  const handleEndReached = useCallback(
    ({ distanceFromEnd }) => {
      if (!canLoadMoreNow(distanceFromEnd)) return;
      lastLoadTsRef.current = Date.now();
      momentumGuardRef.current = true;
      onLoadMore?.();
    },
    [canLoadMoreNow, onLoadMore]
  );

  const handleMomentumBegin = useCallback(() => {
    momentumGuardRef.current = false;
  }, []);

  const handleLayout = useCallback((e) => {
    listHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  const handleContentSizeChange = useCallback((_w, h) => {
    contentHeightRef.current = h;
  }, []);

  /* ---------------------------- Delete / edit / share --------------------------- */

  const handleDeletePost = (post) => {
    const typeLabels = {
      review: 'review',
      'check-in': 'check-in',
      sharedPost: 'shared post',
      liveStream: 'live stream',
    };

    const label = typeLabels[post.type] || 'post';

    Alert.alert(
      'Delete Post',
      `Are you sure you want to delete this ${label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(deletePost({ postId: post._id }));
              medium();
            } catch (error) {
              console.error('Error deleting post:', error);
              Alert.alert(
                'Error',
                'Something went wrong while deleting the post.'
              );
            }
          },
        },
      ]
    );
  };

  const handleEditPost = (post) => {
    if (!post || !post.type) {
      console.warn('Invalid post object passed to handleEditPost');
      return;
    }

    const lowerType = post.type.toLowerCase();

    if (lowerType === 'review' || lowerType === 'check-in') {
      navigation.navigate('CreatePost', {
        postType: post.type,
        isEditing: true,
        initialPost: post,
      });
    } else if (
      lowerType === 'sharedpost' ||
      lowerType === 'shared' ||
      lowerType === 'livestream'
    ) {
      setEditingSharedPost(true);
      setSelectedPostForShare(post);
      setShareToFeedVisible(true);
    } else {
      console.warn('Unsupported post type for editing:', post.type);
    }
  };

  const openShareToFeedModal = (post) => {
    setShareToFeedVisible(true);
    setSelectedPostForShare(post);
    medium();
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
          return item.type === 'suggestion'
            ? `suggestion-${index}`
            : `${item.type}-${id}`;
        }}
        viewabilityConfig={safeViewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeaderComponent}
        onEndReached={pagingEnabled ? handleEndReached : undefined}
        onEndReachedThreshold={pagingEnabled ? 0.2 : undefined}
        onMomentumScrollBegin={pagingEnabled ? handleMomentumBegin : undefined}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        ListFooterComponent={
          pagingEnabled
            ? isLoadingMoreEffective
              ? (
                <ActivityIndicator
                  size="small"
                  style={{ marginVertical: 10 }}
                />
                )
              : !hasMoreEffective
                ? (
                  <Text
                    style={{
                      textAlign: 'center',
                      color: 'gray',
                      marginVertical: 20,
                    }}
                  >
                    🎉 You’re all caught up!
                  </Text>
                  )
                : null
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
          const id = item._id || item.id || item.postId;
          const isInView = activePostId && activePostId === id;

          if (item.type === 'invite') {
            return (
              <InviteCard
                invite={item}
                onShare={openShareToFeedModal}
                // if invites ever get video, you can pass isInView here too
              />
            );
          }
          if (item.type === 'check-in') {
            return (
              <CheckInItem
                item={item}
                photoTapped={photoTapped}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
                onShare={openShareToFeedModal}
                setPhotoTapped={setPhotoTapped}
                isInView={isInView} // 👉 for PhotoFeed / VideoItem
              />
            );
          }
          if (item.type === 'suggestion') {
            return (
              <SuggestionItem
                suggestion={item}
                onShare={openShareToFeedModal}
                isInView={isInView}
              />
            );
          }
          if (item.type === 'sharedPost') {
            return (
              <SharedPostItem
                item={item}
                photoTapped={photoTapped}
                setPhotoTapped={setPhotoTapped}
                handleDelete={handleDeletePost}
                handleEdit={handleEditPost}
                onShare={openShareToFeedModal}
                isInView={isInView}
              />
            );
          }
          return (
            <ReviewItem
              item={item}
              photoTapped={photoTapped}
              setPhotoTapped={setPhotoTapped}
              handleDelete={handleDeletePost}
              handleEdit={handleEditPost}
              onShare={openShareToFeedModal}
              isInView={isInView}
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
    </>
  );
}
