import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import VideoThumbnail from '../Reviews/VideoThumbnail';

const TYPE_MAP = {
  invite: 'invites', invites: 'invites',
  event: 'events', events: 'events',
  promotion: 'promotions', promo: 'promotions', promotions: 'promotions',
  review: 'reviews', reviews: 'reviews',
  checkin: 'checkins', 'check-in': 'checkins', checkins: 'checkins',
  live: 'liveStreams',
  livestream: 'liveStreams',
  liveStream: 'liveStreams',
  'live-stream': 'liveStreams',
  liveStreams: 'liveStreams',
  shared: 'sharedPosts', sharedpost: 'sharedPosts', sharedPosts: 'sharedPosts',
};

const FRIENDLY = {
  reviews: 'review',
  checkins: 'check-in',
  invites: 'invite',
  events: 'event',
  promotions: 'promotion',
  liveStreams: 'live',
  sharedPosts: 'post',
};

const PLACEHOLDER = {
  liveStreams: '🔴',
  sharedPosts: '🔁',
  default: '🖼️',
};

const nameFrom = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
const normalizeType = (t) => TYPE_MAP[String(t || '').trim()] || '';

// ✅ Resolve type, with a fallback for `postType: "suggestion"` using `kind`
const resolveType = (pp) => {
  const base = normalizeType(pp?.canonicalType || pp?.postType || pp?.type);
  if (base) return base;

  const kind = String(pp?.kind || '').toLowerCase();
  if (kind.includes('event')) return 'events';
  if (kind.includes('promo') || kind.includes('promotion')) return 'promotions';
  return '';
};

const resolveFullName = (pp) =>
  pp?.fullName ||
  nameFrom(pp?.sender) ||
  (pp?.originalOwner?.__typename === 'User' ? nameFrom(pp?.originalOwner) : '') ||
  nameFrom(pp?.user) ||
  nameFrom(pp?.owner) ||
  'Someone';

const resolveBusinessName = (pp) =>
  pp?.user?.businessName ??
  pp?.business?.businessName ??
  pp?.businessName ??
  null;

// ✅ Make sure we treat business-owned promos/events correctly
const isBusinessOwned = (pp, type) =>
  (type === 'events' || type === 'promotions') &&
  (
    pp?.originalOwnerModel === 'Business' ||
    pp?.originalOwner?.__typename === 'Business' ||
    !!pp?.user?.businessName ||
    !!pp?.businessName ||
    !!pp?.business?.businessName
  );

const friendlyType = (type) => FRIENDLY[type] || 'post';

const sharedFriendlyType = (pp) =>
  friendlyType(normalizeType(pp?.shared?.originalType)) || 'post';

// ✅ Primary label: special handling for events/promos to show "Business • Event/Promotion"
const buildPrimaryLabel = ({ type, pp, overlayText, displayName, fullName }) => {
  if (overlayText) return overlayText;

  if (type === 'sharedPosts') {
    return `${fullName || 'Someone'} shared a ${sharedFriendlyType(pp)}`;
  }

  if (type === 'events' || type === 'promotions') {
    const businessName = resolveBusinessName(pp) || displayName || fullName || 'Someone';
    const baseType = friendlyType(type);            // "event" or "promotion"
    const labelType = baseType.charAt(0).toUpperCase() + baseType.slice(1); // "Event"/"Promotion"
    return `${businessName} • ${labelType}`;
  }

  if (type === 'liveStreams') {
    const live = pp?.live || pp?.details;
    const status = live?.status;
    if (status === 'live') {
      return `${fullName || 'Someone'} is live`;
    }
    return `${fullName || 'Someone'} went live`;
  }

  // invites are short-circuited earlier
  return `${displayName}'s ${friendlyType(type)}`;
};

// ✅ Secondary label: show title for events/promotions
const buildSecondaryLabel = ({ type, pp }) => {
  if (type === 'liveStreams') {
    const live = pp?.live || pp?.details;
    return live?.title || null;
  }

  if (type === 'events' || type === 'promotions') {
    return pp?.title || null;
  }

  if (type === 'sharedPosts') {
    const op = pp?.shared?.originalPreview;
    return op?.business?.businessName || op?.placeName || null;
  }

  return null;
};

const pickMedia = ({ type, pp }) => {
  // Invites: no media by product decision
  if (type === 'sharedPosts') {
    let kind =
      pp?.mediaType === 'video'
        ? 'video'
        : pp?.mediaType === 'image'
        ? 'image'
        : 'none';
    let uri = pp?.mediaUrl || null;

    if (!uri && pp?.shared?.originalPreview) {
      const op = pp.shared.originalPreview;
      kind =
        op?.mediaType === 'video'
          ? 'video'
          : op?.mediaType === 'image'
          ? 'image'
          : 'none';
      uri = op?.mediaUrl || null;

      // 🔁 Fallback to originalPreview.media[0]
      if (!uri && Array.isArray(op?.media) && op.media.length > 0) {
        const m = op.media[0];
        uri = m.url || m.uri || null;
        if (kind === 'none') {
          const mt = (m.mimeType || m.contentType || '').toLowerCase();
          const isVideo =
            m.mediaType === 'video' ||
            m.type === 'video' ||
            mt.startsWith('video/');
          kind = isVideo ? 'video' : 'image';
        }
      }
    }

    return { kind, uri };
  }

  if (type === 'liveStreams') {
    const live = pp?.live || pp?.details || {};
    const uri = live.playbackUrl || live.vodUrl || null;
    const kind = uri ? 'video' : 'none';
    return { kind, uri };
  }

  // 🔽 Generic posts (reviews, check-ins, events, promos, etc.)
  let kind =
    pp?.mediaType === 'video'
      ? 'video'
      : pp?.mediaType === 'image'
      ? 'image'
      : null;
  let uri = pp?.mediaUrl || null;

  // 🔁 Fallback: first item in media[]
  if (!uri && Array.isArray(pp?.media) && pp.media.length > 0) {
    const m = pp.media[0];
    uri = m.url || m.uri || null;

    if (!kind) {
      const mt = (m.mimeType || m.contentType || '').toLowerCase();
      const isVideo =
        m.mediaType === 'video' ||
        m.type === 'video' ||
        mt.startsWith('video/');
      kind = isVideo ? 'video' : 'image';
    }
  }

  if (!kind) kind = 'none';

  return { kind, uri };
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
  const type = resolveType(pp);
  const isInvite = type === 'invites';
  const liveDetails = pp?.live || pp?.details;
  const mediaToRender = !!pp?.details?.playbackUrl ? pp?.details : pp;

  // Invites: render ONLY "<fullName>'s invite"
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

  const { kind: mediaKind, uri: mediaUri } = pickMedia({ type, pp });
  
  // Review bottom text (non-invite)
  const previewBottomText = pp?.reviewText || '';

  const _unusedInviteDateChip = pp?.dateTime
    ? dayjs(pp.dateTime).format('ddd, MMM D • h:mm A')
    : null;

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
          {type === 'liveStreams' && liveDetails?.status === 'live' && (
            <View style={styles.livePill}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
      )}
      {mediaKind === 'image' && mediaUri ? (
        <Image source={{ uri: mediaUri }} style={styles.media} resizeMode="cover" />
      ) : mediaKind === 'video' && mediaUri ? (
        <VideoThumbnail
          file={mediaToRender}
          width={width}
          height={height}
          shouldPlay={false}
        />
      ) : (
        <View style={[styles.media, styles.placeholder]}>
          <Text style={styles.placeholderEmoji}>
            {PLACEHOLDER[type] || PLACEHOLDER.default}
          </Text>
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
  livePill: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 0, 0, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
