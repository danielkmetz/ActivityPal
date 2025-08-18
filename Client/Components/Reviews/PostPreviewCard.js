import React, { useEffect, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { Avatar } from 'react-native-paper';
import { FontAwesome } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { isVideo } from '../../utils/isVideo';
import { VideoView } from 'expo-video';
import { useSmartVideoPlayer } from '../../utils/useSmartVideoPlayer';
import { useSelector, useDispatch } from 'react-redux';
import { fetchLogo, selectLogo } from '../../Slices/PhotosSlice';
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';

const pinPic = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

export default function PostPreviewCard({ post }) {
  if (!post) return null;

  const dispatch = useDispatch();
  const logo = useSelector(selectLogo);

  // ----- Common fields (non-invite) -----
  const {
    fullName,
    profilePicUrl,
    rating,
    photos,
    reviewText,
    placeId,
    businessName,
    title,
    type,
  } = post || {};

  const screenWidth = Dimensions.get('window').width;
  const previewWidth = screenWidth - 65;
  const previewHeight = 160;

  // ===== INVITE BRANCH (matches PostPreview style) =====
  const isInvite = (post?.type || post?.postType) === 'invite';

  const senderName = useMemo(() => {
    const first = post?.sender?.firstName || '';
    const last = post?.sender?.lastName || '';
    const combined = `${first} ${last}`.trim();
    return combined || post?.fullName || '';
  }, [post?.sender?.firstName, post?.sender?.lastName, post?.fullName]);

  const businessLabel =
    post?.businessName || post?.placeName || businessName || null;

  const dateChip = isInvite && post?.dateTime
    ? dayjs(post.dateTime).format('ddd, MMM D • h:mm A')
    : null;

  const invitePrimary = `${senderName || 'Someone'}'s invite`;
  const inviteSecondary = businessLabel;

  // For invites, prefer the business logo; fall back to sender profile
  const inviteMediaUri =
    post?.businessLogoUrl || post?.sender?.profilePicUrl || null;

  const inviteBottomText = post?.note || post?.message || '';

  // Avatar for header (sender or business logo fallback)
  const inviteAvatarUri = post?.sender?.profilePicUrl || inviteMediaUri;

  // ===== NON-INVITE MEDIA (existing logic) =====
  const firstMedia = photos?.[0];
  const firstMediaUrl =
    typeof firstMedia === 'string'
      ? firstMedia
      : firstMedia?.url ||
        firstMedia?.uri ||
        firstMedia?.mediaUrl ||
        firstMedia?.media?.url;

  const player = useSmartVideoPlayer(photos?.[0]);

  // ===== Fallbacks for non-invite header text/pics =====
  const displayPic = profilePicUrl || logo || profilePicPlaceholder;
  const displayName = fullName || businessName;
  const displayDescription = reviewText || title;

  useEffect(() => {
    if (placeId) dispatch(fetchLogo(placeId));
  }, [placeId, dispatch]);

  // ===== RENDER =====
  if (isInvite) {
    // Invite layout: small header (avatar + “Dan’s invite”),
    // business name under it, optional date chip, then media, then note/message.
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Avatar.Image
            rounded
            size={40}
            source={
              inviteAvatarUri
                ? { uri: inviteAvatarUri }
                : profilePicPlaceholder
            }
          />
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {invitePrimary}
            </Text>
            {inviteSecondary ? (
              <Text style={styles.subtle} numberOfLines={1}>
                {inviteSecondary}
              </Text>
            ) : null}
          </View>
        </View>

        {dateChip ? (
          <View style={styles.dateChip}>
            <Text style={styles.dateChipText}>{dateChip}</Text>
          </View>
        ) : null}

        {inviteMediaUri ? (
          <Image
            source={{ uri: inviteMediaUri }}
            style={styles.media}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.media, styles.placeholder]}>
            <Text style={styles.placeholderEmoji}>🎟️</Text>
          </View>
        )}

        {!!inviteBottomText && (
          <Text numberOfLines={2} style={styles.reviewText}>
            {inviteBottomText}
          </Text>
        )}
      </View>
    );
  }

  // ===== DEFAULT (existing behavior) =====
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar.Image
          rounded
          size={40}
          source={
            typeof displayPic === 'string' ? { uri: displayPic } : displayPic
          }
        />
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {type === 'check-in' && <Image source={{ uri: pinPic }} style={styles.pinPic} />}
      </View>

      {type === 'review' && (
        <View style={styles.ratingRow}>
          {[...Array(5)].map((_, index) => (
            <FontAwesome
              key={index}
              name={index < rating ? 'star' : 'star-o'}
              size={16}
              color="#FFD700"
              style={{ marginRight: 2 }}
            />
          ))}
        </View>
      )}

      {firstMedia ? (
        isVideo(firstMedia) ? (
          <VideoView
            player={player}
            style={styles.media}
            allowsPictureInPicture
            nativeControls={false}
            contentFit="cover"
          />
        ) : (
          <Image source={{ uri: firstMediaUrl }} style={styles.media} resizeMode="cover" />
        )
      ) : (
        <View style={[styles.media, styles.placeholder]}>
          <Text style={styles.placeholderEmoji}>🖼️</Text>
        </View>
      )}

      {displayDescription ? (
        <Text numberOfLines={2} style={styles.reviewText}>
          {displayDescription}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderColor: '#ccc',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flexShrink: 1,
  },
  subtle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  media: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  reviewText: {
    fontSize: 14,
    color: '#333',
  },
  pinPic: {
    width: 16,
    height: 16,
    marginLeft: 5,
  },
  // Invite-specific helpers
  dateChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#111',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  dateChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
  },
  placeholderEmoji: { fontSize: 28, opacity: 0.85 },
});
