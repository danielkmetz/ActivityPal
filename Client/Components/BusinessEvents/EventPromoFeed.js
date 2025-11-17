import React from 'react';
import { View, FlatList, Dimensions, Animated, StyleSheet } from 'react-native';
import EventDetailsCard from './EventDetailsCard';
import PhotoItem from '../Reviews/Photos/PhotoItem';
import PhotoPaginationDots from '../Reviews/Photos/PhotoPaginationDots';
import PostActions from '../Reviews/PostActions/PostActions';

export default function EventPromoFeed({
  data,
  scrollX,
  lastTapRef,
  activeSection,
  handleEventPromoLike,
  openPromoEventComments,
}) {
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item._id}
      scrollEventThrottle={16}
      renderItem={({ item }) => (
        <View style={styles.itemCard}>
          <View style={styles.itemInfo}>
            <EventDetailsCard item={item} selectedTab={activeSection} styles={styles} />
            {item.photos.length > 0 && (
              <>
                <FlatList
                  data={item.photos}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(photo, index) => index.toString()}
                  scrollEnabled={item.photos.length > 1}
                  scrollEventThrottle={16}
                  renderItem={({ item: photo }) => (
                    <PhotoItem
                      photo={photo}
                      post={item}
                      photoTapped={lastTapRef}
                    />
                  )}
                  style={{ width: Dimensions.get('window').width, marginTop: -10 }}
                />
                <PhotoPaginationDots photos={item.photos} scrollX={scrollX} />
              </>
            )}
            <View style={{ paddingLeft: 15 }}>
              <PostActions
                post={item}
              />
            </View>
          </View>
        </View>
      )}
    />
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
