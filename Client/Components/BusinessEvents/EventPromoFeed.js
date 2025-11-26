import React, { useRef, useEffect, useState } from 'react';
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

  const openShareToFeedModal = () => {
    setShareToFeedVisible(true);
    setSelectedPostForShare(post);
    medium();
  };

  const closeShareToFeed = () => {
    setShareToFeedVisible(false);
    setSelectedPostForShare(null);
  };

  return (
    <>
      <FlatList
        data={data}
        keyExtractor={(item) => item._id}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
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
                <PostActions
                  post={item}
                  onShare={openShareToFeedModal}
                />
              </View>
            </View>
          </View>
        )}
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
