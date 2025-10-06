import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import VideoThumbnail from '../Reviews/VideoThumbnail';
import PostPreview from './PostPreview';
import { selectProfilePic } from '../../Slices/PhotosSlice';
import { selectUser } from '../../Slices/UserSlice';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { fetchEventById } from '../../Slices/EventsSlice';
import { fetchPromotionById } from '../../Slices/PromotionsSlice';

const MessageItem = ({ item, onLongPress }) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser);
  const userId = user?.id;
  const profilePicObject = useSelector(selectProfilePic);
  const currentUserProfilePic = profilePicObject?.url;
  
  if (item.type === 'date') {
    return (
      <View style={styles.dateHeader}>
        <Text style={styles.dateText}>{item.label}</Text>
      </View>
    );
  }

  const isCurrentUser = item.senderId === userId;
  const profilePic = isCurrentUser ? currentUserProfilePic : item.senderProfilePic?.profilePicUrl;
  const hasMedia = item.media?.url;
  const mediaType = item.media?.mediaType;

  const handleLongPress = () => {
    if (isCurrentUser) onLongPress?.(item);
  };

  // helpers (top-level)
  const normalize = (t) => {
    if (!t) return undefined;
    const s = String(t).toLowerCase();
    const map = {
      review: 'reviews', reviews: 'reviews',
      checkin: 'checkins', 'check-in': 'checkins', checkins: 'checkins',
      invite: 'invites', invites: 'invites',
      event: 'events', events: 'events',
      promotion: 'promotions', promotions: 'promotions',
      sharedpost: 'sharedPosts', sharedposts: 'sharedPosts',
      live: 'liveStreams', livestream: 'liveStreams', livestreams: 'liveStreams',
    };
    return map[s] || s;
  };

  const toSingular = (t) => {
    if (!t) return undefined;
    const s = String(t).toLowerCase();
    if (s === 'events') return 'event';
    if (s === 'promotions') return 'promotion';
    return s;
  };

  // drop-in replacement
  const handleNavigation = () => {
    try {
      const pp = item.postPreview || {};
      const topType = normalize(pp.canonicalType || pp.postType || pp.type);
      const sharedId = pp.postId || item.post?.postId; // SharedPost _id
      const originalTypePlural = pp.shared ? normalize(pp.shared.originalType) : undefined;
      const originalType = toSingular(originalTypePlural);
      const originalId = pp.shared?.originalId;

      // 1) Shared posts → ALWAYS CommentScreen (by sharedId)
      if (topType === 'sharedPosts' && sharedId) {
        navigation.navigate('CommentScreen', {
          reviewId: sharedId,
          isShared: true,
          sharedPost: true,
          original: originalId ? { type: originalType, id: originalId } : undefined,
          sharedPreview: {
            mediaType: pp.mediaType,
            mediaUrl: pp.mediaUrl,
            business: pp.business,
            fullName: pp.fullName,
          },
          initialIndex: 0,
        });
        return;
      }

      // 2) Live streams
      if (topType === 'liveStreams') {
        const status = pp?.live?.status;
        const playbackUrl = pp?.live?.playbackUrl;
        const vodUrl = pp?.live?.vodUrl;

        if (status === 'live' && playbackUrl) {
          navigation.navigate('LiveStreamPlayer', {
            liveStreamId: pp.postId,
            playbackUrl,
            title: pp?.live?.title || '',
          });
          return;
        }
        if (vodUrl) {
          navigation.navigate('LiveReplayPlayer', {
            liveStreamId: pp.postId,
            vodUrl,
            title: pp?.live?.title || '',
          });
        }
        return;
      }

      // 3) Direct events/promotions → EventDetails
      if (topType === 'events' || topType === 'promotions') {
        const id = pp.postId || item.post?.postId;
        if (!id) return;
        const singular = toSingular(topType);
        if (singular === 'event') {
          dispatch(fetchEventById({ eventId: id }));
        } else {
          dispatch(fetchPromotionById({ promoId: id }));
        }
        navigation.navigate('EventDetails', {
          activity: { postType: singular, postId: id },
          origin: 'dm',
        });
        return;
      }

      // 4) Reviews / Check-ins / Invites → CommentScreen
      if (topType === 'reviews' || topType === 'checkins' || topType === 'invites') {
        const id = pp.postId;
        if (!id) return;
        navigation.navigate('CommentScreen', {
          reviewId: id,
          initialIndex: 0,
          taggedUsersByPhotoKey: pp.taggedUsersByPhotoKey || {},
        });
        return;
      }

      // 5) Fallback: no-op
    } catch (err) {
      console.error('[MessageItem] NAV ERROR:', err);
    }
  };

  return (
    <View style={[styles.messageRow, isCurrentUser ? styles.rowReverse : styles.row]}>
      {!isCurrentUser && (
        <Image
          source={profilePic ? { uri: profilePic } : profilePicPlaceholder}
          style={styles.avatar}
        />
      )}
      <TouchableOpacity onLongPress={handleLongPress}>
        <View
          style={[
            styles.messageBubble,
            item.messageType === 'post' && item.postPreview
              ? styles.noBubble
              : isCurrentUser
                ? styles.sent
                : styles.received,
          ]}
        >
          {hasMedia && (
            <View style={styles.messageMediaWrapper}>
              {mediaType === 'image' ? (
                <Image
                  source={{ uri: item.media.url }}
                  style={styles.messageMedia}
                  resizeMode="cover"
                />
              ) : (
                <VideoThumbnail file={item.media} width={200} height={200} shouldPlay={false} />
              )}
            </View>
          )}

          {item.messageType === 'post' && item.postPreview ? (
            <TouchableOpacity onPress={handleNavigation} onLongPress={handleLongPress}>
              <PostPreview postPreview={item.postPreview} />
            </TouchableOpacity>
          ) : (
            !!item.content && item.content !== '[media]' && (
              <Text style={styles.messageText}>{item.content}</Text>
            )
          )}
        </View>
      </TouchableOpacity>
      {isCurrentUser && (
        <Image
          source={profilePic ? { uri: profilePic } : profilePicPlaceholder}
          style={styles.avatar}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 6,
  },
  messageBubble: {
    padding: 10,
    borderRadius: 10,
    marginVertical: 4,
  },
  sent: { backgroundColor: '#00cc99', alignSelf: 'flex-end' },
  received: { backgroundColor: '#eee', alignSelf: 'flex-start' },
  messageText: { color: '#000' },
  messageMediaWrapper: {
    marginBottom: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  messageMedia: { width: 200, height: 200, borderRadius: 10 },
  dateHeader: { alignItems: 'center', marginVertical: 10 },
  dateText: { fontSize: 13, fontWeight: '600', color: '#888' },
  noBubble: { backgroundColor: 'transparent', padding: 0, marginVertical: 6 },
});

export default MessageItem;
