import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import VideoThumbnail from '../Reviews/VideoThumbnail';
import { getValidPostType } from '../../utils/posts/getValidPostType';
import { resolvePreviewMedia } from '../../utils/Media/resolveMedia';
import { resolveFullName } from '../../utils/posts/resolveFullName';

const smallPin = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

const FRIENDLY = {
  review: 'review',
  'check-in': 'check-in',
  checkIn: 'check-in',
  invite: 'invite',
  activityInvite: 'invite',
  event: 'event',
  promotion: 'promotion',
  sharedPost: 'post',
  liveStream: 'live stream',
};

const PLACEHOLDER = {
  'check-in': smallPin,
  checkIn: smallPin,
  sharedPost: '🔁',
  default: '🖼️',
};

const resolveBusinessName = (pp) =>
  pp?.user?.businessName ??
  pp?.business?.businessName ??
  pp?.businessName ??
  null;

const friendlyType = (t) => FRIENDLY[t] || 'post';

const safeGetType = (pp) => {
  try {
    return getValidPostType(pp);
  } catch (e) {
    const t = String(pp?.type || '').trim();
    if (t === 'sharedPost' || t === 'sharedPosts') return 'sharedPost';

    const kind = String(pp?.kind || '').toLowerCase();
    if (kind.includes('event')) return 'event';
    if (kind.includes('promotion') || kind.includes('promo')) return 'promotion';

    return 'unknown';
  }
};

const isBusinessOwned = (pp, type) =>
  (type === 'event' || type === 'promotion') &&
  (
    pp?.originalOwnerModel === 'Business' ||
    pp?.originalOwner?.__typename === 'Business' ||
    !!pp?.user?.businessName ||
    !!pp?.businessName ||
    !!pp?.business?.businessName
  );

const sharedFriendlyType = (pp) => {
  const t = String(pp?.shared?.originalType || '').trim().toLowerCase();
  if (!t) return 'post';
  if (t.includes('event')) return 'event';
  if (t.includes('promo') || t.includes('promotion')) return 'promotion';
  if (t.includes('invite')) return 'invite';
  if (t.includes('check')) return 'check-in';
  if (t.includes('review')) return 'review';
  return 'post';
};

const buildPrimaryLabel = ({ type, pp, overlayText, displayName, fullName }) => {
  if (overlayText) return overlayText;

  if (type === 'sharedPost') {
    return `${fullName || 'Someone'} shared a ${sharedFriendlyType(pp)}`;
  }

  if (type === 'event' || type === 'promotion') {
    const businessName = resolveBusinessName(pp) || displayName || fullName || 'Someone';
    const base = friendlyType(type); // "event" / "promotion"
    const labelType = base.charAt(0).toUpperCase() + base.slice(1);
    return `${businessName} • ${labelType}`;
  }

  return `${displayName}'s ${friendlyType(type)}`;
};

const buildSecondaryLabel = ({ type, pp }) => {
  if (type === 'event' || type === 'promotion') return pp?.title || null;

  if (type === 'sharedPost') {
    const op = pp?.shared?.originalPreview;
    return op?.business?.businessName || op?.placeName || null;
  }

  return null;
};

export default function PostPreview({
  postPreview: pp,
  width = 200,
  height = 200,
  showOverlay = true,
  overlayText,
  showPostText = false,
}) {
  if (!pp) return null;
  const type = safeGetType(pp);
  const isInvite = type === 'invite' || type === 'activityInvite';

  if (isInvite) {
    const fullName = resolveFullName(pp);
    return (
      <View style={[styles.wrapper, styles.inviteOnlyWrapper, { width, height }]}>
        <Text style={styles.inviteOnlyText} numberOfLines={1}>
          {`${fullName}'s invite`}
        </Text>
      </View>
    );
  }

  const fullName = resolveFullName(pp);
  const businessName = resolveBusinessName(pp);
  const displayName = isBusinessOwned(pp, type)
    ? businessName || 'A business'
    : fullName;

  const primaryLabel = buildPrimaryLabel({
    type,
    pp,
    overlayText,
    displayName,
    fullName,
  });
  const secondaryLabel = buildSecondaryLabel({ type, pp });

  const { kind: mediaKind, uri: mediaUri } = resolvePreviewMedia(pp, pp?.bannerPresignedUrl || null);

  const mediaToRender = !!pp?.details?.playbackUrl ? pp?.details : pp;
  const previewBottomText = pp?.reviewText || '';

  return (
    <View style={[styles.wrapper, { width, height }]}>
      {showOverlay && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText} numberOfLines={1}>
            {primaryLabel}
          </Text>
          {!!secondaryLabel && (
            <Text style={styles.overlaySubText} numberOfLines={1}>
              {secondaryLabel}
            </Text>
          )}
        </View>
      )}
      {mediaKind === 'image' && mediaUri ? (
        <Image source={{ uri: mediaUri }} style={styles.media} resizeMode="cover" />
      ) : mediaKind === 'video' && mediaUri ? (
        <VideoThumbnail file={mediaToRender} width={width} height={height} shouldPlay={false} />
      ) : (
        <View style={[styles.media, styles.placeholder]}>
          {(() => {
            const ph = PLACEHOLDER[type] || PLACEHOLDER.default;
            const isUrl = typeof ph === 'string' && /^https?:\/\//.test(ph);

            if (isUrl) {
              return (
                <Image
                  source={{ uri: ph }}
                  style={styles.placeholderIcon}
                  resizeMode="contain"
                />
              );
            }

            return <Text style={styles.placeholderEmoji}>{ph}</Text>;
          })()}
        </View>
      )}
      {showPostText && !!previewBottomText && (
        <View style={styles.reviewOverlay}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.reviewText}>
            {previewBottomText}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: 16, overflow: 'hidden', position: 'relative' },
  inviteOnlyWrapper: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  inviteOnlyText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  overlay: {
    position: 'absolute',
    top: 0,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'column',
    zIndex: 2,
  },
  overlayText: { color: '#fff', fontWeight: '600', fontSize: 16, padding: 2 },
  overlaySubText: { color: '#fff', opacity: 0.9, fontSize: 13, padding: 2 },
  media: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#222' },
  placeholderEmoji: { fontSize: 28, opacity: 0.85 },
  placeholderIcon: { width: 44, height: 44, opacity: 0.9 },
  reviewOverlay: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    zIndex: 2,
  },
  reviewText: { color: '#fff', fontSize: 16, fontWeight: '400', padding: 2 },
});
