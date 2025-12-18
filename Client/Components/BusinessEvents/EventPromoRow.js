import React, { useRef, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import EventDetailsCard from "./EventDetailsCard";
import PhotoFeed from "../Reviews/Photos/PhotoFeed";
import PostActions from "../Reviews/PostActions/PostActions";

export default function EventPromoRow({
  item,
  selectedTab,          // "events" | "promotions"
  scrollX,
  photoTapped,
  setPhotoTapped,
  onShare,
}) {
  // Stable object ref PhotoFeed can mutate/read
  const bridgeRef = useRef({ current: 0, setCurrent: () => {} });
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  bridgeRef.current.current = currentPhotoIndex;
  bridgeRef.current.setCurrent = setCurrentPhotoIndex;

  const handleShare = useCallback(() => {
    onShare?.(item);
  }, [onShare, item]);

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemInfo}>
        <EventDetailsCard item={item} selectedTab={selectedTab} styles={styles} />
        <PhotoFeed
          scrollX={scrollX}
          post={item}
          photoTapped={photoTapped}
          setPhotoTapped={setPhotoTapped}
          isMyEventsPromosPage={true}
          currentIndexRef={bridgeRef.current}
        />
        <View style={{ paddingLeft: 15 }}>
          <PostActions post={item} onShare={handleShare} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 5,
    marginBottom: 10,
    elevation: 2,
    position: "relative",
    paddingBottom: 20,
  },
  itemInfo: { flex: 1 },
});
