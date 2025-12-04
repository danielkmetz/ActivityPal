import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, Text, Animated, TouchableWithoutFeedback,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import { isVideo } from '../../../utils/isVideo';
import { useNavigation, useRoute } from '@react-navigation/native';
import VideoThumbnail from '../VideoThumbnail';
import { handleLikeWithAnimation as likeWithAnim } from '../../../utils/LikeHandlers';
import { useLikeAnimations } from '../../../utils/LikeHandlers/LikeAnimationContext';
import { selectNearbySuggestionById } from '../../../Slices/GooglePlacesSlice';
import ProfilePic from '../PostHeader/ProfilePic';
import ExpandableText from '../ExpandableText';
import SharePostModal from '../SharedPosts/SharePostModal';
import { pickPostId } from '../../../utils/posts/postIdentity';
import { selectPromotionById } from '../../../Slices/PromotionsSlice';
import { selectEventById } from '../../../Slices/EventsSlice';
import { selectPostById } from '../../../Slices/PostsSelectors/postsSelectors';
import PostActions from '../PostActions/PostActions';

const { width, height } = Dimensions.get('window');

const FullScreenPhoto = () => {
  const dispatch = useDispatch();
  const route = useRoute();
  const navigation = useNavigation();
  const {
    reviewId,
    selectedType,            // 'review' | 'check-in' | 'invite' | 'event' | 'promotion' | 'promo' | suggestion
    initialIndex = 0,
    taggedUsersByPhotoKey,
    isEventPromo = false,
  } = route?.params ?? {};
  const user = useSelector(selectUser);

  // ---- pick the source object from the store ----
  const review = useSelector((state) => {
    if (isEventPromo) {
      if (selectedType === 'event') return selectEventById(state, reviewId);
      if (selectedType === 'promo' || selectedType === 'promotion') return selectPromotionById(state, reviewId);
      return selectNearbySuggestionById(state, reviewId);
    }
    return selectPostById(state, reviewId);
  });

  // ---- normalize files list (media/photos) ----
  const files = useMemo(() => {
    if (!review) return [];
    if (Array.isArray(review.media) && review.media.length) return review.media;
    if (Array.isArray(review.photos) && review.photos.length) return review.photos;
    return [];
  }, [review]);

  const flatListRef = useRef();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showTags, setShowTags] = useState(false);
  const [originalSize, setOriginalSize] = useState({ width: 1, height: 1 });
  const [renderedSize, setRenderedSize] = useState({ width, height });
  const [selectedPostForShare, setSelectedPostForShare] = useState(null);
  const [shareToFeedVisible, setShareToFeedVisible] = useState(false);
  const currentFile = files[currentIndex];
  const { getAnimation, registerAnimation } = useLikeAnimations();
  const animation = getAnimation(review?._id);
  const lastTapRef = useRef({});
  const owner = review?.owner
  const ownerId = owner?.id || owner?._id || owner?.userId;
  const ownerPic = owner?.profilePicUrl || review?.businessLogoUrl || review?.logoUrl;
  const ownerName = owner?.fullName || review?.businessName;

  const postTypeFor = (item) => {
    const t = String(item?.type || '').toLowerCase();
    if (t) return t; // review, check-in, invite, sharedPost, liveStream, event, promotion
    if (item?.kind || item?.__typename) return 'suggestion';
    return undefined;
  };

  // ---- fixed like handler (uses `review`, not `reviewItem`) ----
  const likeWithOverlay = (force = false) => {
    likeWithAnim({
      postType: postTypeFor(review),
      postId: pickPostId(review),
      review,
      user,
      dispatch,
      animation: getAnimation(review?._id),
      lastTapRef,
      force,
    });
  };

  // ---- double/single tap ----
  const handleTap = () => {
    const now = Date.now();
    const postId = review?._id;
    if (!postId) return;

    const last = lastTapRef.current[postId] || 0;
    if (now - last < 300) {
      // double
      lastTapRef.current[postId] = 0;
      likeWithOverlay(true);
    } else {
      // single
      lastTapRef.current[postId] = now;
      setTimeout(() => {
        if (lastTapRef.current[postId] === now) {
          setShowTags((prev) => !prev);
          lastTapRef.current[postId] = 0;
        }
      }, 200);
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

  useEffect(() => {
    if (review?._id) registerAnimation(review._id);
  }, [review?._id, registerAnimation]);

  // ---- graceful fallback instead of returning null (prevents a blank screen) ----
  if (!review) {
    return (
      <View style={[styles.overlay, { justifyContent: 'center', alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={30} color="white" />
        </TouchableOpacity>
        <Text style={{ color: '#fff' }}>Post not found.</Text>
      </View>
    );
  }

  if (!files.length) {
    return (
      <View style={[styles.overlay, { justifyContent: 'center', alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={30} color="white" />
        </TouchableOpacity>
        <Text style={{ color: '#fff' }}>No media to display.</Text>
      </View>
    );
  }

  const tagsForCurrent =
    (taggedUsersByPhotoKey?.[currentFile?.photoKey] ?? currentFile?.taggedUsers ?? []) || [];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.overlay}>
        {/* Close */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={30} color="white" />
        </TouchableOpacity>
        {/* Media */}
        <FlatList
          ref={flatListRef}
          horizontal
          pagingEnabled
          scrollEnabled={files.length > 1}
          initialScrollIndex={Math.min(initialIndex, files.length - 1)}
          getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index, animated: false });
            }, 100);
          }}
          showsHorizontalScrollIndicator={false}
          overScrollMode="never"
          data={files}
          keyExtractor={(item, idx) => String(item?._id || item?.photoKey || idx)}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentIndex(idx);
          }}
          renderItem={({ item }) => (
            <View style={styles.imageWrapper}>
              {isVideo(item) ? (
                <VideoThumbnail file={item} width={width} height={height} />
              ) : (
                <TouchableWithoutFeedback onPress={handleTap}>
                  <Image
                    source={{ uri: item.url || item.uri }}
                    style={styles.fullImage}
                    onLayout={(e) => {
                      const { width: rw, height: rh } = e.nativeEvent.layout;
                      setRenderedSize({ width: rw, height: rh });
                    }}
                    onLoad={() => {
                      const src = item.url || item.uri;
                      if (src) Image.getSize(src, (w, h) => setOriginalSize({ width: w, height: h }));
                    }}
                  />
                </TouchableWithoutFeedback>
              )}
              {showTags &&
                tagsForCurrent.map((u, i) => {
                  // Support absolute px or normalized coords
                  const left = typeof u.x === 'number' && u.x <= 1 ? u.x * renderedSize.width : u.x;
                  const top  = typeof u.y === 'number' && u.y <= 1 ? u.y * renderedSize.height : u.y;
                  return (
                    <View key={u.userId || i} style={[styles.tagBubble, { top, left }]}>
                      <Text style={styles.tagText}>{u.fullName}</Text>
                    </View>
                  );
                })}
            </View>
          )}
        />
        {/* Actions */}
        <View style={styles.actionsContainer}>
          <PostActions 
            post={review}
            onShare={openShareToFeedModal}
            orientation={"column"}
          />
        </View>
        {/* Owner + text */}
        <View style={styles.bottomOverlay}>
          <View style={styles.postOwner}>
            <ProfilePic userId={ownerId} profilePicUrl={ownerPic} />
            <Text style={styles.postOwnerName}>{ownerName}</Text>
          </View>
          {review?.title ? <Text style={styles.title}>{review.title}</Text> : null}
          <ExpandableText post={review} maxLines={3} textStyle={styles.reviewText} seeMoreStyle={styles.seeMoreLink} />
        </View>
        {/* Animated Like Bubble (guarded) */}
        {!!animation && (
          <Animated.View style={[styles.likeOverlay, { opacity: animation }]}>
            <MaterialCommunityIcons name="thumb-up" size={80} color="#80E6D2" />
          </Animated.View>
        )}
      </View>
      {/* Share flows */}
      <SharePostModal visible={shareToFeedVisible} onClose={closeShareToFeed} post={selectedPostForShare} />
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
  imageWrapper: { width, height, position: 'relative' },
  fullImage: { width, height, resizeMode: 'contain' },
  closeButton: { position: 'absolute', top: 60, right: 30, zIndex: 2 },
  actionsContainer: { position: 'absolute', right: -15, top: height / 2 + 10, zIndex: 10, justifyContent: 'center', alignItems: 'center' },
  likeOverlay: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -40 }, { translateY: -40 }] },
  tagBubble: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 4, zIndex: 15, transform: [{ translateX: -20 }, { translateY: -20 }] },
  tagText: { fontSize: 12, color: '#000', fontWeight: 'bold' },
  bottomOverlay: { position: 'absolute', height: '20%', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  postOwner: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  postOwnerName: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 10 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600', marginVertical: 5 },
  reviewText: { color: '#fff', fontSize: 14 },
});

export default FullScreenPhoto;
