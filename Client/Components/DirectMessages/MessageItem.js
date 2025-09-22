import React, { useRef, useState } from 'react';
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
  const lastTapRef = useRef({});
  const [likedAnimations, setLikedAnimations] = useState({});

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

  const handleNavigation = () => {
    // Must have post + preview
    const pp = item.postPreview || {};
    const canonicalType = pp.canonicalType || pp.postType || pp.type;

    // 1) EVENTS / PROMOTIONS (existing behavior)
    if (canonicalType === 'events' || canonicalType === 'promotions') {
      if (canonicalType === 'events') {
        dispatch(fetchEventById({ eventId: item.post.postId }));
      } else {
        dispatch(fetchPromotionById({ promoId: item.post.postId }));
      }
      return navigation.navigate('EventDetails', { activity: item.post });
    }

    // 2) SHARED POSTS → route to the ORIGINAL post
    if (canonicalType === 'sharedPosts' && pp.shared) {
      const originalType = pp.shared.originalType; // canonical ('reviews','checkins','events','promotions','invites')
      const originalId = pp.shared.originalId;

      // If original is event/promotion, reuse EventDetails flow
      if (originalType === 'events' || originalType === 'promotions') {
        if (originalType === 'events') {
          dispatch(fetchEventById({ eventId: originalId }));
        } else {
          dispatch(fetchPromotionById({ promoId: originalId }));
        }
        return navigation.navigate('EventDetails', {
          activity: { postType: originalType === 'events' ? 'event' : 'promotion', postId: originalId },
        });
      }

      // Else, comment screen for content posts (review/check-in/invite)
      return navigation.navigate('CommentScreen', {
        reviewId: originalId, // your screen expects `reviewId` as the generic id
        initialIndex: 0,
        lastTapRef,
        likedAnimations,
        setLikedAnimations,
        taggedUsersByPhotoKey: pp.shared.originalPreview?.taggedUsersByPhotoKey || {},
      });
    }

    // 3) LIVE STREAMS → Live screen if live, otherwise Replay if VOD exists
    if (canonicalType === 'liveStreams') {
      const status = pp?.live?.status;
      const playbackUrl = pp?.live?.playbackUrl;
      const vodUrl = pp?.live?.vodUrl;

      if (status === 'live' && playbackUrl) {
        return navigation.navigate('LiveStreamPlayer', {
          liveStreamId: pp.postId,
          playbackUrl,
          title: pp?.live?.title || '',
        });
      }
      if (vodUrl) {
        return navigation.navigate('LiveReplayPlayer', {
          liveStreamId: pp.postId,
          vodUrl,
          title: pp?.live?.title || '',
        });
      }
      return;
    }

    // 4) DEFAULT: comment screen for reviews/check-ins/invites
    return navigation.navigate('CommentScreen', {
      reviewId: pp.postId,
      initialIndex: 0,
      lastTapRef,
      likedAnimations,
      setLikedAnimations,
      taggedUsersByPhotoKey: pp.taggedUsersByPhotoKey || {},
    });
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
