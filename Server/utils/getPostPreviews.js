// utils/getPostPreviews.js
const Review = require('../models/Reviews');
const CheckIn = require('../models/CheckIns');
const ActivityInvite = require('../models/ActivityInvites');
const Event = require('../models/Events');
const Promotion = require('../models/Promotions');
const LiveStream = require('../models/LiveStream');
const SharedPost = require('../models/SharedPost');

const User = require('../models/User');
const Business = require('../models/Business');
const { getPresignedUrl } = require('./cachePresignedUrl');

/* ----------------------------- Normalization ----------------------------- */

function normalizePostType(t = '') {
  const s = String(t).trim().toLowerCase();

  if (['review', 'reviews'].includes(s)) return 'reviews';
  if (['check-in', 'checkin', 'checkins'].includes(s)) return 'checkins';
  if (['invite', 'invites', 'activityinvite', 'activityinvites'].includes(s)) return 'invites';
  if (['event', 'events'].includes(s)) return 'events';
  if (['promotion', 'promotions', 'promo', 'promos'].includes(s)) return 'promotions';
  if (['livestream', 'live-stream', 'live', 'livestreams', 'live-streams', 'livestreams'].includes(s)) return 'liveStreams';
  if (['sharedpost', 'sharedposts'].includes(s)) return 'sharedPosts';

  return s;
}

function mediaFromArray(arr = []) {
  if (!Array.isArray(arr) || arr.length === 0) return { key: null, type: null };
  const first = arr[0] || {};
  if (first.videoKey) return { key: first.videoKey, type: 'video' };
  if (first.photoKey) {
    const isVideo = String(first.photoKey).toLowerCase().endsWith('.mp4');
    return { key: first.photoKey, type: isVideo ? 'video' : 'image' };
  }
  return { key: null, type: null };
}

async function nameFromUserId(userId) {
  if (!userId) return '';
  const u = await User.findById(userId).select('firstName lastName').lean();
  if (!u) return '';
  return `${u.firstName || ''} ${u.lastName || ''}`.trim();
}

async function businessFromPlaceId(placeId) {
  if (!placeId) return null;
  return Business.findOne({ placeId }).select('businessName placeId _id').lean();
}

async function nameFromOwner(originalOwnerId, originalOwnerModel) {
  if (!originalOwnerId || !originalOwnerModel) return '';
  if (originalOwnerModel === 'User') {
    return nameFromUserId(originalOwnerId);
  }
  if (originalOwnerModel === 'Business') {
    const b = await Business.findById(originalOwnerId).select('businessName').lean();
    return b?.businessName || '';
  }
  return '';
}

/* --------------------------- Per-type previewers -------------------------- */

async function buildPreviewForRef({ postType, postId }) {
  try {
    const canonicalType = normalizePostType(postType);

    let post = null;
    let fullName = '';
    let business = null;
    let mediaKey = null;
    let mediaType = null;

    switch (canonicalType) {
      /* -------------------- REVIEWS -------------------- */
      case 'reviews': {
        post = await Review.findById(postId).lean();
        if (!post) return null;
        fullName = await nameFromUserId(post.userId);
        const m = mediaFromArray(post.photos);
        mediaKey = m.key; mediaType = m.type;
        break;
      }

      /* -------------------- CHECKINS ------------------- */
      case 'checkins': {
        post = await CheckIn.findById(postId).lean();
        if (!post) return null;
        fullName = await nameFromUserId(post.userId);
        const m = mediaFromArray(post.photos);
        mediaKey = m.key; mediaType = m.type;
        break;
      }

      /* -------------------- INVITES -------------------- */
      case 'invites': {
        post = await ActivityInvite.findById(postId).lean();
        if (!post) return null;
        fullName = await nameFromUserId(post.senderId);
        const m = mediaFromArray(post.media);
        mediaKey = m.key; mediaType = m.type;
        break;
      }

      /* -------------------- EVENTS --------------------- */
      case 'events': {
        post = await Event.findById(postId).lean();
        if (!post) return null;
        business = await businessFromPlaceId(post.placeId);
        const m = mediaFromArray(post.photos);
        mediaKey = m.key; mediaType = m.type;
        break;
      }

      /* ------------------ PROMOTIONS ------------------- */
      case 'promotions': {
        post = await Promotion.findById(postId).lean();
        if (!post) return null;
        business = await businessFromPlaceId(post.placeId);
        const m = mediaFromArray(post.photos);
        mediaKey = m.key; mediaType = m.type;
        break;
      }

      /* ------------------ LIVE STREAMS ----------------- */
      case 'liveStreams': {
        post = await LiveStream.findById(postId).lean();
        if (!post) return null;

        // Host name
        fullName = await nameFromUserId(post.hostUserId);

        // Prefer a coverKey image if present; otherwise no mediaKey
        mediaKey = post.coverKey || null;
        mediaType = post.status === 'live' ? 'live' : 'video';

        const mediaUrl = mediaKey ? await getPresignedUrl(mediaKey) : null;

        return {
          postId,
          postType,                // original as sent
          canonicalType,           // normalized
          fullName,                // host’s name
          business: null,
          mediaUrl,                // cover image if present
          mediaType,               // 'live' | 'video' | null
          live: {
            playbackUrl: post.playbackUrl || null,
            vodUrl: post?.recording?.vodUrl || null,
            status: post.status || 'idle',
            isActive: !!post.isActive,
            title: post.title || '',
            durationSec: post.durationSec || null,
            placeId: post.placeId || null,
          },
        };
      }

      /* ------------------- SHARED POSTS ---------------- */
      case 'sharedPosts': {
        const sp = await SharedPost.findById(postId).lean();
        if (!sp) return null;

        // Person who shared:
        fullName = await nameFromUserId(sp.user);

        // Original owner name (User/Business)
        const originalOwnerName = await nameFromOwner(sp.originalOwner, sp.originalOwnerModel);

        // Build a **minimal original preview** by reusing this helper recursively.
        // Normalize the original type to whatever our helper expects.
        const normalizedOriginalType = normalizePostType(sp.postType);
        const originalPreview =
          (await buildPreviewForRef({
            postType: normalizedOriginalType,
            postId: sp.originalPostId,
          })) || null;

        // For card thumb, prefer the original’s media if it exists.
        // (We don’t store media on SharedPost itself.)
        let mediaUrl = null;
        let typeForShared = null;
        if (originalPreview?.mediaUrl) {
          mediaUrl = originalPreview.mediaUrl;
          typeForShared = originalPreview.mediaType;
        }

        // Bubble up business only if the original had a business (events/promotions).
        business = originalPreview?.business || null;

        return {
          postId,
          postType,               // original as sent
          canonicalType,          // 'sharedPosts'
          fullName,               // sharer’s full name
          business,               // carries through from original (if any)
          mediaUrl,               // from original post’s first media (if any)
          mediaType: typeForShared || null,

          shared: {
            caption: sp.caption || '',
            originalType: normalizedOriginalType,   // canonical original type
            originalId: sp.originalPostId,
            originalOwner: {
              id: sp.originalOwner,
              model: sp.originalOwnerModel,        // 'User' | 'Business'
              name: originalOwnerName,
            },
            originalPreview,                        // minimal preview object
            createdAt: sp.createdAt,
          },
        };
      }

      default:
        return null;
    }

    const mediaUrl = mediaKey ? await getPresignedUrl(mediaKey) : null;

    return {
      postId,
      postType,        // original string sent in
      canonicalType,   // normalized router key
      fullName,        // owner’s (or sender’s) full name
      business,        // for events/promotions (null otherwise)
      mediaUrl,        // signed URL or null
      mediaType,       // 'image' | 'video' | 'live' | null
    };
  } catch (err) {
    console.warn(`⚠️ Failed to fetch preview for ${postType} ${postId}:`, err.message);
    return null;
  }
}

/* ---------------------------------- API ---------------------------------- */

const getPostPreviews = async (postRefs = []) => {
  const previews = await Promise.all(
    (postRefs || []).map(({ postType, postId }) =>
      buildPreviewForRef({ postType, postId })
    )
  );
  return previews.filter(Boolean);
};

module.exports = getPostPreviews;
