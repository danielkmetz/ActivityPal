import React, { useMemo, useState, useRef, useEffect } from "react";
import { View, FlatList, Animated, Dimensions } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import MediaItem from "./MediaItem";
import PhotoPaginationDots from "./PhotoPaginationDots";
import { createPhotoFeedHandlers } from "./photoFeedHandlers";
import { selectBanner } from "../../../Slices/PhotosSlice";
import { resolveMediaList } from "../../../utils/Media/resolveMedia";
import { resolvePostContent } from "../../../utils/posts/resolvePostContent";

const screenWidth = Dimensions.get("window").width;

const keyForMedia = (m, i) => {
  if (m == null) return String(i);
  if (typeof m === "string") return m; // URL string
  return m.photoKey || m._id || m.id || m.url || m.uri || String(i);
};

export default function PhotoFeed({
  scrollX,
  post,
  photoTapped,
  setPhotoTapped,
  onActiveChange,
  isMyEventsPromosPage = false,
  isInView = true,
  onIndexChange,
  onActiveMediaChange,
}) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const postContent = resolvePostContent(post);
  const banner = useSelector(selectBanner);
  const media = useMemo(() => {
    return resolveMediaList(post, banner?.presignedUrl);
  }, [
    post?._id,
    post?.updatedAt,
    post?.original?._id,
    post?.original?.updatedAt,
    banner?.presignedUrl,
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const internalScrollX = useRef(new Animated.Value(0)).current;
  const sx = scrollX || internalScrollX;

  const { handlePhotoTap } = useMemo(
    () =>
      createPhotoFeedHandlers({
        dispatch,
        navigation,
        postContent,
        photoTapped,
        isMyEventsPromosPage,
      }),
    [dispatch, navigation, post?._id, photoTapped, isMyEventsPromosPage]
  );

  const computeIndex = (e) => {
    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
    const idx = Math.round(x / screenWidth);
    
    return Math.max(0, Math.min(idx, Math.max(0, media.length - 1)));
  };

  const notifyParent = (idx) => {
    onIndexChange?.(idx);
    const activeItem = media[idx];
    onActiveMediaChange?.(activeItem, idx);
  };

  useEffect(() => {
    if (!media.length) return;
    setActiveIndex(0);
    notifyParent(0);
  }, [post?._id, media.length]);

  if (!media.length) return null;

  return (
    <View style={{ width: screenWidth, alignSelf: "center" }}>
      <FlatList
        data={media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => keyForMedia(item, index)}
        scrollEnabled={media.length > 1}
        overScrollMode="never"
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: sx } } }], {
          useNativeDriver: false,
          listener: (e) => {
            const idx = computeIndex(e);
            setActiveIndex((prev) => (prev === idx ? prev : idx));
          },
        })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = computeIndex(e);
          setActiveIndex(idx);
          notifyParent(idx);
        }}
        onTouchStart={() => onActiveChange?.(true)}
        onTouchEnd={() => onActiveChange?.(false)}
        renderItem={({ item, index }) => {
          const isActiveMedia = index === activeIndex;

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
          );
        }}
      />
      {media.length > 1 && <PhotoPaginationDots photos={media} scrollX={sx} />}
    </View>
  );
}
