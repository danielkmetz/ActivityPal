import React, { useRef, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import PostPreview from '../DirectMessages/PostPreview';
import { fetchEventById } from '../../Slices/EventsSlice';
import { fetchPromotionById } from '../../Slices/PromotionsSlice';
import { isVideo } from '../../utils/isVideo';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const SharedPostStoryContent = ({
  post,
  onPressIn,
  onPressOut,
  isPreview,
}) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const [showBubble, setShowBubble] = useState(false);
  const timeoutRef = useRef(null);

  const videoCheck = isVideo(post);
  const mediaType = videoCheck ? 'video' : 'image';
  const mediaUrl =
    post?.media?.[0]?.url ||
    post?.photos?.[0]?.url ||
    post?.mediaUrl;
  const postType = post?.type;

  const handlePress = () => {
    if (!showBubble && !isPreview) {
      setShowBubble(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setShowBubble(false);
      }, 2000);
    }
  };

  const handleNavigate = () => {
    if (post.type === "event") {
      dispatch(fetchEventById({ eventId: post._id }));
      navigation.navigate("EventDetails", { activity: post });
    } else if (post.type === "promotion" || post.type === "promo") {
      dispatch(fetchPromotionById({ promoId: post._id }));
      navigation.navigate("EventDetails", { activity: post });
    } else {
      navigation.navigate("CommentScreen", {
        reviewId: post._id,
        initialIndex: 0,
        taggedUsersByPhotoKey: post.taggedUsersByPhotoKey || {},
      });
    }
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  if (isPreview) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.previewContainer}>
          <PostPreview
            postPreview={{
              ...post,
              mediaType,
              mediaUrl,
              postType,
            }}
            width={screenWidth - 32}
            height={screenHeight * 0.5}
            showOverlay={true}
            showPostText={true}
          />
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={styles.wrapper}
    >
      <View style={styles.previewContainer}>
        <PostPreview
          postPreview={{
            ...post,
            mediaType,
            mediaUrl,
            postType,
          }}
          width={screenWidth - 32}
          height={screenHeight * 0.5}
          showOverlay={true}
          showPostText={true}
        />
        {showBubble && (
          <Pressable onPress={handleNavigate} style={styles.viewPostBubble}>
            <Text style={styles.viewPostText}>View post</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
};

export default SharedPostStoryContent;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 10,
  },
  previewContainer: {
    width: screenWidth - 32,
    height: screenHeight * 0.5,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  viewPostBubble: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 15,
  },
  viewPostText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
});
