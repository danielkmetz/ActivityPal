import React, { useEffect, useState, useMemo } from 'react';
import { View, FlatList, Animated, Dimensions } from 'react-native';
import PhotoItem from './PhotoItem';
import PhotoPaginationDots from './PhotoPaginationDots';
import SuggestionDetailsModal from '../../SuggestionDetails/SuggestionDetailsModal';
import { createPhotoFeedHandlers } from './photoFeedHandlers';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { selectBanner } from '../../../Slices/PhotosSlice';

const screenWidth = Dimensions.get('window').width;

export default function PhotoFeed({
  scrollX,
  post,
  photoTapped,
  setPhotoTapped,
  onActiveChange, // ← optional callback to mirror your previous onTouchStart/onTouchEnd behavior
  currentIndexRef,
  isCommentScreen=false,
  isMyEventsPromosPage=false,
}) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const postContent = post?.original ?? post ?? {};
  const banner = useSelector(selectBanner);
  const media = postContent?.photos || postContent?.media || postContent?.bannerUrl || banner?.presignedUrl;
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const { handlePhotoTap } = useMemo(
    () =>
      createPhotoFeedHandlers({
        dispatch,
        navigation,
        postContent,
        onOpenDetails: setDetailsVisible,
        photoTapped,
        isCommentScreen,
        isMyEventsPromosPage,
      }),
    [
      postContent?._id,              // keep deps minimal & stable
      postContent?.placeId,
      photoTapped,
    ]
  );

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
              setPhotoTapped={setPhotoTapped}
              onOpenFullScreen={handlePhotoTap}
            />
          </View>
        )}
      />
      {media?.length > 1 && (
        <PhotoPaginationDots photos={media} scrollX={scrollX} />
      )}
      <SuggestionDetailsModal 
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        suggestion={postContent}
      />
    </View>
  );
}
