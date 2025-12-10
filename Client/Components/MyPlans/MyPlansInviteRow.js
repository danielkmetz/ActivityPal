import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import NeedsRecapBadge from '../Reviews/Invites/NeedsRecapBadge'; // ⬅️ adjust path if needed

export default function MyPlansInviteRow({ item, onPress }) {
  if (!item) return null;

  const placeText = item.mainLabel || '';
  const timeText = item.timeLabel || '';

  const status = (item.statusForUser || '').toLowerCase();
  const isHost = !!item.isHost;
  const needsRecap = !!(item.details && item.details.needsRecap);

  let tag = 'INVITE';
  if (isHost) {
    tag = 'HOST';
  } else if (status === 'accepted') {
    tag = 'GOING';
  } else if (status === 'pending' || status === 'invited') {
    tag = 'PENDING';
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* left side: avatar + text */}
      <View style={styles.rowLeft}>
        <View style={styles.rowImageWrapper}>
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.rowImage}
            />
          ) : (
            <View style={styles.rowImageFallback}>
              <Text style={styles.rowImageFallbackText}>
                {placeText ? placeText[0] : '?'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rowContent}>
          <Text style={styles.rowPlace} numberOfLines={1}>
            {placeText}
          </Text>
          <Text style={styles.rowTime} numberOfLines={1}>
            {timeText}
          </Text>
          <View style={styles.tagPill}>
            <Text style={styles.tagPillText}>{tag}</Text>
          </View>
        </View>
      </View>
      {/* right side: recap badge */}
      {needsRecap && (
        <View style={styles.badgeWrapper}>
          <NeedsRecapBadge post={item}/>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowImageWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginRight: 10,
  },
  rowImage: {
    width: '100%',
    height: '100%',
  },
  rowImageFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowImageFallbackText: {
    fontSize: 18,
    fontWeight: '700',
  },
  rowContent: {
    flex: 1,
  },
  rowPlace: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowTime: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  tagPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  tagPillText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  badgeWrapper: {
    marginLeft: 8,
  },
});
