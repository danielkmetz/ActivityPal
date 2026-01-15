import React from 'react';
import { View, Text, Image, FlatList, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';

const { width } = Dimensions.get('window');

const MapCardCarousel = ({ activities = [], onCardPress, carouselRef, onEndReached, loadingMore, onViewableItemsChanged, viewabilityConfig }) => {
  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => onCardPress?.(item.location, item.place_id)}>
        <View style={styles.card}>
            {item.photoUrl && (
                <Image source={{ uri: item.photoUrl }} style={styles.image} />
            )}
            <View style={styles.textContainer}>
                <Text style={styles.name}>{item?.name}</Text>
                <Text style={styles.address}>{item?.address}</Text>
                <Text style={styles.vicinity}>{Number(item?.distance).toFixed(3)} miles</Text>
            </View>
        </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.carouselContainer}>
      <FlatList
        ref={carouselRef}
        data={activities}
        horizontal
        keyExtractor={(item, index) => item.place_id || index.toString()}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 10 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.7}
        ListFooterComponent={loadingMore ? (
            <ActivityIndicator size="small" color="#2196F3" style={{ marginLeft: 15 }} />
        ) : null}
      />
    </View>
  );
};

export default MapCardCarousel;

const styles = StyleSheet.create({
  carouselContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginRight: 12,
    width: width * 0.7,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  image: {
    width: '100%',
    height: 120,
  },
  textContainer: {
    padding: 10,
  },
  name: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  address: {
    fontSize: 14,
    color: '#444',
    marginTop: 4,
  },
  vicinity: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
