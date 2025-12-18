import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import EventDetailsCard from './EventDetailsCard';
import PostActions from '../Reviews/PostActions/PostActions';
import PhotoFeed from '../Reviews/Photos/PhotoFeed';
import SharePostModal from '../Reviews/SharedPosts/SharePostModal';
import { medium } from '../../utils/Haptics/haptics';

export default function EventPromoFeed({
  data,
  scrollX,
  activeSection,
  ListHeaderComponent = null,
  ListFooterComponent = null,
}) {
  const [photoTapped, setPhotoTapped] = useState(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [shareToFeedVisible, setShareToFeedVisible] = useState(false);
  const [selectedPostForShare, setSelectedPostForShare] = useState(null);
  const currentIndexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentPhotoIndex !== currentIndexRef.current) {
        setCurrentPhotoIndex(currentIndexRef.current);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [currentPhotoIndex]);

  const openShareToFeedModal = useCallback((post) => {
    setShareToFeedVisible(true);
    setSelectedPostForShare(post);
    medium();
  }, []);

  const closeShareToFeed = useCallback(() => {
    setShareToFeedVisible(false);
    setSelectedPostForShare(null);
  }, []);

  const keyExtractor = useCallback((item, index) => {
    return String(item?._id || item?.id || index);
  }, []);

  const renderItem = useCallback(({ item }) => {
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemInfo}>
          <EventDetailsCard item={item} selectedTab={activeSection} styles={styles} />
          <PhotoFeed
            scrollX={scrollX}
            post={item}
            photoTapped={photoTapped}
            setPhotoTapped={setPhotoTapped}
            isMyEventsPromosPage={true}
            currentIndexRef={{ current: currentPhotoIndex, setCurrent: setCurrentPhotoIndex }}
          />
          <View style={{ paddingLeft: 15 }}>
            <PostActions post={item} onShare={() => openShareToFeedModal(item)} />
          </View>
        </View>
      </View>
    );
  }, [activeSection, scrollX, photoTapped, currentPhotoIndex, openShareToFeedModal]);

  return (
    <>
      <FlatList
        data={Array.isArray(data) ? data : []}
        keyExtractor={keyExtractor}
        scrollEventThrottle={16}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        renderItem={renderItem}
      />
      <SharePostModal
        visible={shareToFeedVisible}
        onClose={closeShareToFeed}
        post={selectedPostForShare}
        isEditing={false}
        setIsEditing={() => {}}
      />
    </>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 5,
    marginBottom: 10,
    elevation: 2,
    position: 'relative',
    paddingBottom: 20,
  },
  itemInfo: {
    flex: 1,
  },
});
