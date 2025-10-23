import React, { useEffect, useState, useRef } from 'react';
import { View, FlatList, Animated, Dimensions } from 'react-native';
import PhotoItem from './PhotoItem';
import PhotoPaginationDots from './PhotoPaginationDots';
import { useNavigation } from '@react-navigation/native';

const screenWidth = Dimensions.get('window').width;

export default function PhotoFeed({
  scrollX,
  post,
  photoTapped,
  onActiveChange, // ← optional callback to mirror your previous onTouchStart/onTouchEnd behavior
}) {
  const navigation = useNavigation();
  const postContent = post?.original ?? post ?? {};
  const media = postContent?.photos || postContent?.media;
  const { isSuggestedFollowPost } = postContent;
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState()
  const currentIndexRef = useRef(0);
  
  const taggedUsersByPhotoKey = Object.fromEntries(
    (media || []).map((photo) => [
      photo.photoKey,
      photo.taggedUsers || [],
    ])
  );

  //console.log(media)

  const onOpenFullScreen = (photo, index) => {
    navigation.navigate('FullScreenPhoto', {
      reviewId: postContent._id,
      initialIndex: index,
      taggedUsersByPhotoKey: taggedUsersByPhotoKey || {},
      isSuggestedPost: isSuggestedFollowPost,
    });
  };

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
        renderItem={({ item, index }) => (
          <View style={{ width: screenWidth }}>
            <PhotoItem
              photo={item}
              reviewItem={post}
              index={index}
              photoTapped={photoTapped}
              onOpenFullScreen={onOpenFullScreen}
            />
          </View>
        )}
      />
      {media?.length > 1 && (
        <PhotoPaginationDots photos={media} scrollX={scrollX} />
      )}
    </View>
  );
}
