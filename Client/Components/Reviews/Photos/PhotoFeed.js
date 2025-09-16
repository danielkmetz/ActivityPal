import React from 'react';
import { View, FlatList, Animated, Dimensions } from 'react-native';
import PhotoItem from './PhotoItem';
import PhotoPaginationDots from './PhotoPaginationDots';

const screenWidth = Dimensions.get('window').width;

export default function PhotoFeed({
  media = [],
  scrollX,
  currentIndexRef,
  setCurrentPhotoIndex,
  reviewItem,
  photoTapped,
  handleLikeWithAnimation,
  lastTapRef,
  onOpenFullScreen,
  onActiveChange, // ← optional callback to mirror your previous onTouchStart/onTouchEnd behavior
}) {
  return (
    <View style={{ width: screenWidth, alignSelf: 'center' }}>
      <FlatList
        data={media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(photo, index) => index.toString()}
        scrollEnabled={media?.length > 1}
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
                reviewItem={reviewItem}
                index={index}
                photoTapped={photoTapped}
                handleLikeWithAnimation={handleLikeWithAnimation}
                lastTapRef={lastTapRef}
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
