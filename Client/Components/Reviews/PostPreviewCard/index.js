import React, { useMemo, useEffect } from 'react';
import { Avatar } from 'react-native-paper';
import dayjs from 'dayjs';
import { useDispatch, useSelector } from 'react-redux';
import { fetchLogo, selectLogo } from '../../../Slices/PhotosSlice';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';
import { useSmartVideoPlayer } from '../../../utils/useSmartVideoPlayer';
import { isVideo as checkIsVideo } from '../../../utils/isVideo';
import { pickFirstUrl, firstOf, safeUserName, safeBusinessLabel } from './utils/extractors';
import { isInvite, isReplay, isLive, isSharedPost } from './utils/guards';
import Invites from './variants/Invites';
import Lives from './variants/Lives';
import Replays from './variants/Replays';
import SharedPosts from './variants/SharedPosts';
import Default from './variants/Default';
import { FontAwesome } from '@expo/vector-icons';

export default function PostPreviewCard({ post }) {
  if (!post) return null;
  const dispatch = useDispatch();
  const logo = useSelector(selectLogo);
  const rating = post?.details?.rating;
  const {
    fullName,
    profilePicUrl,
    media,
    reviewText,
    placeId,
    businessName,
    bannerUrl,
    title,
    type,
  } = post || {};

  // fetch logo for business posts and shared originals
  useEffect(() => {
    const effectivePlaceId = placeId || post?.original?.placeId;
    if (effectivePlaceId) dispatch(fetchLogo(effectivePlaceId));
  }, [placeId, post?.original?.placeId, dispatch]);

  /** INVITE */
  if (isInvite(post)) {
    const senderName = useMemo(() => {
      const combined = safeUserName(post?.sender);
      return combined || post?.fullName || '';
    }, [post?.sender?.firstName, post?.sender?.lastName, post?.fullName]);

    const businessLabel = safeBusinessLabel(post, businessName);
    const dateChip = post?.dateTime ? dayjs(post.dateTime).format('ddd, MMM D • h:mm A') : null;

    const invitePrimary = `${senderName || 'Someone'}'s invite`;
    const inviteSecondary = businessLabel;

    const inviteMediaUri = post?.businessLogoUrl || post?.sender?.profilePicUrl || null;
    const inviteAvatarUri = post?.sender?.profilePicUrl || inviteMediaUri;
    const inviteBottomText = post?.note || post?.message || '';

    return (
      <Invites
        avatarUri={inviteAvatarUri}
        primary={invitePrimary}
        secondary={inviteSecondary}
        dateChip={dateChip}
        mediaUri={inviteMediaUri}
        bottomText={inviteBottomText}
      />
    );
  }
  /** LIVE */
  if (isLive(post)) {
    const liveTitle = post?.title || 'Live now';
    const liveThumb = post?.thumbnailUrl || post?.coverImageUrl || post?.previewImageUrl || null;
    return (
      <Lives
        avatarUri={profilePicUrl}
        name={fullName}
        title={liveTitle}
        thumbUrl={liveThumb}
      />
    );
  }
  /** REPLAY */
  if (isReplay(post)) {
    return (
      <Replays
        avatarUri={profilePicUrl}
        name={fullName}
        title={post?.title}
        file={post}
      />
    );
  }
  /** SHARED POST */
  if (isSharedPost(post)) {
    const original = post?.original || {};
    const sharer = post?.user || post?.originalOwner;
    const sharerName = safeUserName(sharer) || post?.user?.fullName || 'Someone';
    const originalType = (original?.type || original?.__typename || '').toLowerCase();
    const originalBusiness = safeBusinessLabel(original, businessName);

    const primary =
      originalType === 'promotion'
        ? `${sharerName} shared a promotion`
        : originalType === 'event'
          ? `${sharerName} shared an event`
          : `${sharerName} shared a post`;

    const secondary = originalBusiness || original?.title || null;

    const mediaList = original?.media || original?.photos || original?.images || [];
    const mediaItem = firstOf(mediaList);
    const mediaUrl = pickFirstUrl(mediaItem);
    const looksVideo = checkIsVideo(mediaItem);
    const player = useSmartVideoPlayer(mediaItem);

    const description =
      original?.description ||
      original?.reviewText ||
      original?.title ||
      post?.caption ||
      '';

    const avatar =
      sharer?.profilePicUrl ||
      post?.originalOwner?.profilePicUrl ||
      original?.businessLogoUrl ||
      profilePicPlaceholder;

    return (
      <SharedPosts
        avatarUri={avatar}
        primary={primary}
        secondary={secondary}
        isVideo={looksVideo}
        player={player}
        mediaUrl={mediaUrl}
        bannerUrl={post?.bannerUrl}
        description={description}
      />
    );
  }
  /** DEFAULT */
  const firstMedia = firstOf(media);
  const firstMediaUrl = pickFirstUrl(firstMedia);
  const isVid = checkIsVideo(firstMedia);
  const player = useSmartVideoPlayer(firstMedia);

  const avatarNode = (
    <Avatar.Image
      rounded
      size={40}
      source={
        profilePicUrl
          ? { uri: profilePicUrl }
          : logo
            ? { uri: logo }
            : profilePicPlaceholder
      }
    />
  );

  const stars =
    type === 'review'
      ? [...Array(5)].map((_, i) => (
        <FontAwesome
          key={i}
          name={i < (rating || 0) ? 'star' : 'star-o'}
          size={16}
          color="#FFD700"
          style={{ marginRight: 2 }}
        />
      ))
      : null;

  return (
    <Default
      avatarSource={avatarNode}
      displayName={fullName || businessName}
      type={type}
      ratingStars={stars}
      isVideo={isVid}
      player={player}
      imageUrl={firstMediaUrl}
      bannerUrl={bannerUrl}
      description={reviewText || title}
    />
  );
}
