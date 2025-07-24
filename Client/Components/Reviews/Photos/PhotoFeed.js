import React from 'react';
import {
    View,
    FlatList,
    TouchableOpacity,
    Animated,
    Dimensions,
} from 'react-native';
import PhotoItem from './PhotoItem';
import PhotoPaginationDots from './PhotoPaginationDots';

const screenWidth = Dimensions.get("window").width;

export default function PhotoFeed({
    media = [],
    scrollX,
    currentIndexRef,
    reviewItem,
    photoTapped,
    handleLikeWithAnimation,
    lastTapRef,
    onOpenFullScreen,
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
                            const index = Math.round(
                                e.nativeEvent.contentOffset.x / screenWidth
                            );
                            if (currentIndexRef?.current !== undefined) {
                                currentIndexRef.current = index;
                            }
                        },
                    }
                )}
                scrollEventThrottle={16}
                renderItem={({ item, index }) => (
                    <View style={{ width: screenWidth }}>
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => onPhotoTap(item)}
                        >
                            <PhotoItem
                                photo={item}
                                reviewItem={reviewItem}
                                index={index}
                                photoTapped={photoTapped}
                                handleLikeWithAnimation={handleLikeWithAnimation}
                                lastTapRef={lastTapRef}
                                onOpenFullScreen={onOpenFullScreen}
                            />
                        </TouchableOpacity>
                    </View>
                )}
            />
            {media?.length > 1 && (
                <PhotoPaginationDots photos={media} scrollX={scrollX} />
            )}
        </View>
    );
}
