import React, { useRef, useState, useEffect } from 'react';
import {
  View, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, Text, Animated, TouchableWithoutFeedback,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import BottomCommentsModal from './BottomCommentsModal';
import { isVideo } from '../../utils/isVideo';
import { useNavigation, useRoute } from '@react-navigation/native';
import VideoThumbnail from './VideoThumbnail';
import { handleLikeWithAnimation } from '../../utils/LikeHandlers';
import { eventPromoLikeWithAnimation } from '../../utils/LikeHandlers/promoEventLikes';
import { selectReviewById } from '../../utils/reviewSelectors';
import { useLikeAnimations } from '../../utils/LikeHandlers/LikeAnimationContext';
import { selectNearbySuggestionById } from '../../Slices/GooglePlacesSlice';
import StoryAvatar from '../Stories/StoryAvatar';
import ExpandableText from './ExpandableText';
import ShareOptionsModal from './SharedPosts/ShareOptionsModal';
import SharePostModal from './SharedPosts/SharePostModal';
import PostActions from './PostActions';

const { width, height } = Dimensions.get('window');

const FullScreenPhoto = () => {
  const dispatch = useDispatch();
  const route = useRoute();
  const navigation = useNavigation();
  const {
    reviewId,
    initialIndex = 0,
    taggedUsersByPhotoKey,
    isEventPromo = false,
  } = route?.params;
  const user = useSelector(selectUser);
  const review = isEventPromo ?
    useSelector((state) => selectNearbySuggestionById(state, reviewId)) : useSelector(selectReviewById(reviewId));
  const flatListRef = useRef();
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showTags, setShowTags] = useState(false);
  const [originalSize, setOriginalSize] = useState({ width: 1, height: 1 });
  const [renderedSize, setRenderedSize] = useState({ width, height });
  const [selectedPostForShare, setSelectedPostForShare] = useState(null);
  const [shareOptionsVisible, setShareOptionsVisible] = useState(false);
  const [shareToFeedVisible, setShareToFeedVisible] = useState(false);
  const photos = review?.photos || [];
  const currentPhoto = photos[currentIndex];
  const { getAnimation, registerAnimation } = useLikeAnimations();
  const animation = getAnimation(review?._id);
  const lastTapRef = useRef({});
  const taggedUsers = taggedUsersByPhotoKey?.[currentPhoto?.photoKey] || [];
  const eventPromoType = ["activeEvent", "upcomingEvent"].includes(review.kind) ? "event" : "promo";
  const postText = review.reviewText || review.message || null;

  const likeWithAnimation = (force = false) => {
    const postId = review._id;
    const animation = getAnimation(postId);

    if (isEventPromo) {
      return eventPromoLikeWithAnimation({
        type: eventPromoType,
        postId,
        item: review,
        user,
        lastTapRef,
        animation,
        dispatch,
        force,
      })
    } else {
      return handleLikeWithAnimation({
        postType: review.type,
        postId,
        review,
        user,
        animation,
        lastTapRef,
        dispatch,
        force,
      });
    }
  };

  const handleTap = () => {
    const now = Date.now();
    const postId = review._id;

    if (!lastTapRef.current[postId]) lastTapRef.current[postId] = 0;

    if (now - lastTapRef.current[postId] < 300) {
      likeWithAnimation(review);
      lastTapRef.current[postId] = 0;
    } else {
      lastTapRef.current[postId] = now;
      setTimeout(() => {
        if (lastTapRef.current[postId] === now) {
          setShowTags(prev => !prev);
          lastTapRef.current[postId] = 0;
        }
      }, 200);
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
    if (review?._id) {
      registerAnimation(review._id);
    }
  }, [review?._id]);

  if (!review || !Array.isArray(review.photos) || review.photos.length === 0) {
    return null;
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.overlay}>
        {/* Close Button */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
          <MaterialCommunityIcons name="close" size={30} color="white" />
        </TouchableOpacity>
        {/* Photos */}
        {photos.length > 0 && (
          <FlatList
            ref={flatListRef}
            horizontal
            pagingEnabled
            scrollEnabled={photos.length > 1}
            initialScrollIndex={initialIndex}
            getItemLayout={(data, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index, animated: false });
              }, 100);
            }}
            showsHorizontalScrollIndicator={false}
            data={photos}
            keyExtractor={(item, index) => index.toString()}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / width);
              setCurrentIndex(index);
            }}
            renderItem={({ item }) => (
              <View style={styles.imageWrapper}>
                {isVideo(item) ? (
                  <VideoThumbnail
                    file={item}
                    width={width}
                    height={height}
                  />
                ) : (
                  <TouchableWithoutFeedback onPress={handleTap}>
                    <Image
                      source={{ uri: item.url || item.uri }}
                      style={styles.fullImage}
                      onLayout={(e) => {
                        const { width: renderedWidth, height: renderedHeight } = e.nativeEvent.layout;
                        setRenderedSize({ width: renderedWidth, height: renderedHeight });
                      }}
                      onLoad={() => {
                        Image.getSize(item.url || item.uri, (w, h) => {
                          setOriginalSize({ width: w, height: h });
                        });
                      }}
                    />
                  </TouchableWithoutFeedback>
                )}
                {showTags && taggedUsers.map((user, i) => (
                  <View
                    key={user.userId || i}
                    style={[
                      styles.tagBubble,
                      {
                        top: user.y * (renderedSize.height / originalSize.height),
                        left: user.x * (renderedSize.width / originalSize.width),
                      },
                    ]}
                  >
                    <Text style={styles.tagText}>{user.fullName}</Text>
                  </View>
                ))}
              </View>
            )}
          />
        )}
        <View style={styles.actionsContainer}>
        <PostActions
          item={review}
          onShare={openShareOptions}
          handleLikeWithAnimation={() => likeWithAnimation(true)}
          handleOpenComments={() => setCommentsVisible(true)}
          toggleTaggedUsers={() => setShowTags((prev) => !prev)}
          photo={currentPhoto}
          isCommentScreen={false}
          orientation="column"
        />
        </View>
        <View style={styles.bottomOverlay}>
          <View style={styles.postOwner}>
            <StoryAvatar userId={review?.userId} profilePicUrl={review.profilePicUrl} />
            <Text style={styles.postOwnerName}>{review.fullName}</Text>
          </View>
          <ExpandableText
            text={postText}
            maxLines={3}
            textStyle={styles.reviewText}
            seeMoreStyle={styles.seeMoreLink}
          />
        </View>
        {/* Animated Like Bubble */}
        <Animated.View style={[styles.likeOverlay, { opacity: animation }]}>
          <MaterialCommunityIcons name="thumb-up" size={80} color="#80E6D2" />
        </Animated.View>
      </View>
      {/* Comments Modal */}
      <BottomCommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        review={review}
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
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrapper: {
    width,
    height,
    position: 'relative',
  },
  fullImage: {
    width,
    height,
    resizeMode: 'contain',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 30,
    zIndex: 2,
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: height / 2 + 10,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  likeOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -40 }, { translateY: -40 }],
    opacity: 0,
  },
  tagBubble: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 15,
    transform: [{ translateX: -20 }, { translateY: -20 }],
  },
  tagText: {
    fontSize: 12,
    color: '#000',
    fontWeight: 'bold',
  },
  bottomOverlay: {
    position: 'absolute',
    height: '20%',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // see-through black overlay
  },
  postOwner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  postOwnerName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  reviewText: {
    color: '#fff',
    fontSize: 14,
  }
});

export default FullScreenPhoto;
