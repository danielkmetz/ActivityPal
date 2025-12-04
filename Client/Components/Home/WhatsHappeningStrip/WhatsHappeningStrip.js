import React, { useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { FontAwesome, Feather } from '@expo/vector-icons';

// items shape:
// {
//   id: string,
//   type: 'you' | 'invite' | 'friends' | 'hot',
//   timeLabel: string,
//   mainLabel: string,
//   imageUrl?: string | null,
//   badge?: string,
//   ...meta
// }

export default function WhatsHappeningStrip({
  items = [],
  onPressItem,
  onPressCreatePlan,
  onPressSeeAll,        // replaces "All plans" bubble
  onSeenFriendsItems,
}) {
  const safeItems = Array.isArray(items) ? items : [];

  const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (!onSeenFriendsItems) return;
    const seenFriendIds = viewableItems
      .map(v => v.item)
      .filter(
        item => item && item.type === 'friends' && typeof item.id === 'string'
      )
      .map(item => item.id);

    if (seenFriendIds.length > 0) {
      onSeenFriendsItems(seenFriendIds);
    }
  }).current;

  const renderCreateBubble = () => (
    <TouchableOpacity
      style={[styles.bubbleWrapper, styles.bubbleWrapperLast]}
      onPress={onPressCreatePlan}
      activeOpacity={0.8}
    >
      <View style={[styles.bubble, styles.createBubble]}>
        <Feather name="plus" size={26} />
      </View>
      <Text style={styles.timeLabel}>Plan</Text>
      <Text style={styles.subLabel}>something</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.bubbleWrapper}
      onPress={() => onPressItem && onPressItem(item)}
      activeOpacity={0.8}
    >
      <View style={styles.bubble}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.bubbleImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.bubbleFallback}>
            <FontAwesome name="map-marker" size={24} />
          </View>
        )}

        {item.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.timeLabel} numberOfLines={1}>
        {item.timeLabel}
      </Text>
      <Text style={styles.subLabel} numberOfLines={2}>
        {item.mainLabel}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>What’s happening</Text>
          {/* <Text style={styles.subtitle}>
            Your invites, friends’ plans, and busy spots near you
          </Text> */}
        </View>

        {onPressSeeAll ? (
          <TouchableOpacity
            onPress={onPressSeeAll}
            hitSlop={styles.hitSlop}
          >
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={safeItems}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        ListFooterComponent={renderCreateBubble}
        contentContainerStyle={styles.listContent}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />
    </View>
  );
}

const BUBBLE_SIZE = 68;

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#777',
  },
  seeAllText: {
    fontSize: 12,
    color: '#4A8DFF',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  bubbleWrapper: {
    width: BUBBLE_SIZE + 10,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  bubbleWrapperLast: {
    marginRight: 8,
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    overflow: 'hidden',
  },
  bubbleImage: {
    width: '100%',
    height: '100%',
  },
  bubbleFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBubble: {
    backgroundColor: '#EEF2FF',
  },
  badge: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  subLabel: {
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
  },
  hitSlop: {
    top: 8,
    bottom: 8,
    left: 8,
    right: 8,
  },
});
