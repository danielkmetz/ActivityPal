import React, { useRef, useState, } from 'react';
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
import { selectUserAndFriendsReviews, selectBusinessReviews, selectOtherUserReviews, selectSuggestedPosts } from '../../Slices/ReviewsSlice';

const { width, height } = Dimensions.get('window');

const FullScreenPhoto = () => {
  const dispatch = useDispatch();
  const route = useRoute();
  const navigation = useNavigation();
  const {
    reviewId,
    initialIndex = 0,
    lastTapRef,
    likedAnimations,
    setLikedAnimations,
    taggedUsersByPhotoKey,
    isBusinessReview = false,
    isOtherUserReview = false,
    isSuggestedPost = false,
  } = route?.params;
  const user = useSelector(selectUser);
  const reviews = useSelector(
    isBusinessReview
      ? selectBusinessReviews
      : isOtherUserReview
        ? selectOtherUserReviews
        : isSuggestedPost
          ? selectSuggestedPosts
          : selectUserAndFriendsReviews
  );
  const review = reviews.find((r) => r._id === reviewId);
  const userId = user?.id;
  const flatListRef = useRef();
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showTags, setShowTags] = useState(false);
  const [originalSize, setOriginalSize] = useState({ width: 1, height: 1 });
  const [renderedSize, setRenderedSize] = useState({ width, height });
  const photos = review?.photos || [];
  const currentPhoto = photos[currentIndex];
  const animation = useRef(likedAnimations?.[review._id] || new Animated.Value(0)).current;
  const hasLiked = Array.isArray(review.likes) && review.likes.some(like => like.userId === userId);
  const taggedUsers = taggedUsersByPhotoKey?.[currentPhoto?.photoKey] || [];
  const likeCount = review?.likes?.length;
  
  const likeWithAnimation = (review) => {
    return handleLikeWithAnimation({
      postType: review.type,
      postId: review._id,
      review,
      user,
      lastTapRef,
      likedAnimations,
      setLikedAnimations,
      dispatch,
    });
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

  const handleLike = () => {
    likeWithAnimation(review);
  };

  if (!review || !Array.isArray(review.photos) || review.photos.length === 0) {
    return null;
  }

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

        {/* Like / Comment Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity onPress={() => setCommentsVisible(true)} style={styles.iconButton}>
            <MaterialCommunityIcons name="comment-outline" size={28} color="white" />
            <Text style={styles.countText}>{review?.comments?.length}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLike} style={styles.iconButton}>
            <MaterialCommunityIcons
              name={hasLiked ? "thumb-up" : "thumb-up-outline"}
              size={28}
              color={hasLiked ? "#009999" : "white"}
            />
            <Text style={styles.countText}>{likeCount}</Text>
          </TouchableOpacity>
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
    right: 20,
    top: height / 2 + 140,
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButton: {
    marginVertical: 15,
    alignItems: 'center',
  },
  countText: {
    color: 'white',
    fontSize: 14,
    marginTop: 4,
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
});

export default FullScreenPhoto;
