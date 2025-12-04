import React, { useEffect, useState, useMemo } from 'react';
import { View, FlatList, Animated, Dimensions } from 'react-native';
import MediaItem from './MediaItem';
import PhotoPaginationDots from './PhotoPaginationDots';
import { createPhotoFeedHandlers } from './photoFeedHandlers';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { selectBanner } from '../../../Slices/PhotosSlice';

const screenWidth = Dimensions.get('window').width;

const pickRawMedia = (postContent, banner) => {
  // 1) Photos array with items
  if (Array.isArray(postContent?.photos) && postContent.photos.length > 0) {
    return postContent.photos;
  }

  // 2) Generic media array with items
  if (Array.isArray(postContent?.media) && postContent.media.length > 0) {
    return postContent.media;
  }

  // 3) Single banner URL (string)
  if (postContent?.bannerUrl) {
    return postContent.bannerUrl;
  }

  // 4) Fallback banner from Redux
  if (banner?.presignedUrl) {
    return banner.presignedUrl;
  }

  // 5) Live stream playback URL (string)
  if (postContent?.details?.playbackUrl) {
    return postContent.details.playbackUrl;
  }

  return null;
};

export default function PhotoFeed({
  scrollX,
  post,
  photoTapped,
  setPhotoTapped,
  onActiveChange, // ← optional callback to mirror your previous onTouchStart/onTouchEnd behavior
  currentIndexRef,
  setOverlayVisible,
  isCommentScreen = false,
  isMyEventsPromosPage = false,
  isInView = true,
}) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const postContent = post?.original ?? post ?? {};
  const banner = useSelector(selectBanner);
  const rawMedia = useMemo(
    () => pickRawMedia(postContent, banner),
    [postContent, banner]
  );
  // console.log('raw media', rawMedia);
  // console.log('post content', postContent)

  const media = useMemo(
    () => (Array.isArray(rawMedia) ? rawMedia : rawMedia ? [rawMedia] : []),
    [rawMedia]
  );
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  
  const { handlePhotoTap } = useMemo(
    () =>
      createPhotoFeedHandlers({
        dispatch,
        navigation,
        postContent,
        setOverlayVisible,
        photoTapped,
        isCommentScreen,
        isMyEventsPromosPage,
      }),
    [
      postContent?._id,              // keep deps minimal & stable
      postContent?.placeId,
      photoTapped,
    ]
  )

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentPhotoIndex !== currentIndexRef.current) {
        setCurrentPhotoIndex(currentIndexRef.current);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [currentPhotoIndex]);

  if (media?.length === 0) {
    return null;
  }

  return (
    <View style={{ width: screenWidth, alignSelf: 'center' }}>
      <FlatList
        data={media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(photo, index) => index.toString()}
        scrollEnabled={media?.length > 1}
        overScrollMode='never'
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          {
            useNativeDriver: false,
            listener: (e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
              if (currentIndexRef?.current !== undefined) {
                currentIndexRef.current = index;
              }
              if (typeof setCurrentPhotoIndex === 'function') {
                setCurrentPhotoIndex(index);
              }
            },
          }
        )}
        scrollEventThrottle={16}
        onTouchStart={() => onActiveChange?.(true)}
        onTouchEnd={() => onActiveChange?.(false)}
        renderItem={({ item, index }) => {
          const isActiveMedia = index === currentIndexRef.current;

          return (
          <View style={{ width: screenWidth }}>
            <MediaItem
              media={item}
              post={post}
              index={index}
              photoTapped={photoTapped}
              setPhotoTapped={setPhotoTapped}
              onOpenFullScreen={handlePhotoTap}
              shouldPlay={isInView && isActiveMedia}
            />
          </View>
          )
        }}
      />
      {Array.isArray(media) && media?.length > 1 && (
        <PhotoPaginationDots photos={media} scrollX={scrollX} />
      )}
    </View>
  );
}
