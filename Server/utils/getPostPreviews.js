const { Post } = require('../models/Post');                        // ✅ unified model
const User = require('../models/User');
const Business = require('../models/Business');
const { getPresignedUrl } = require('./cachePresignedUrl');

// Optional legacy bridge (only used if a requested id isn't in Post yet)
let legacyBridge = null;
try {
  legacyBridge = require('../utils/legacyBridge'); // must export upsertPostFromLegacy(type, id)
} catch (_) {
  // no-op, legacy support disabled
}

/* -------------------------------- helpers -------------------------------- */

const toStr = (v) => (v == null ? '' : String(v));

const normType = (t = '') => {
  const s = String(t).trim().toLowerCase();
  if (['review', 'reviews'].includes(s)) return 'review';
  if (['checkin', 'check-in', 'checkins'].includes(s)) return 'checkIn';
  if (['invite', 'invites', 'activityinvite', 'activityinvites'].includes(s)) return 'invite';
  if (['event', 'events'].includes(s)) return 'event';
  if (['promotion', 'promotions', 'promo', 'promos'].includes(s)) return 'promotion';
  if (['livestream', 'live-stream', 'live', 'livestreams', 'live-streams'].includes(s)) return 'liveStream';
  if (['sharedpost', 'shared', 'sharedposts'].includes(s)) return 'shared';
  return s || 'post';
};

async function ownerName(owner) {
  if (!owner || !owner.id || !owner.ref) return '';
  if (owner.ref === 'User') {
    const u = await User.findById(owner.id).select('firstName lastName').lean();
    return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
  }
  if (owner.ref === 'Business') {
    const b = await Business.findById(owner.id).select('businessName').lean();
    return b?.businessName || '';
  }
  return '';
}

async function businessFromPlaceId(placeId) {
  if (!placeId) return null;
  return Business.findOne({ placeId }).select('businessName placeId _id').lean();
}

function pickFirstMedia(post) {
  // Prefer explicit cover for live streams
  if (post.type === 'liveStream' && post.coverKey) {
    return { key: post.coverKey, kind: 'image' };
  }

  const arr = Array.isArray(post.media) && post.media.length ? post.media
           : Array.isArray(post.photos) && post.photos.length ? post.photos
           : [];

  if (!arr.length) return { key: null, kind: null };

  const first = arr[0] || {};
  if (first.videoKey) return { key: first.videoKey, kind: 'video' };
  if (first.photoKey) {
    const isVideo = String(first.photoKey).toLowerCase().endsWith('.mp4');
    return { key: first.photoKey, kind: isVideo ? 'video' : 'image' };
  }
  if (first.url) {
    // already public URL
    return { key: null, kind: 'image', directUrl: first.url };
  }
  return { key: null, kind: null };
}

/* ------------------------------- previewers ------------------------------ */

async function buildPreviewFromUnified(post, depth = 0) {
  if (!post) return null;

  const type = normType(post.type);
  const postId = String(post._id);
  const owner = post.owner || null;

  // Who to display as "fullName" (historic field): show user name when owner is a User;
  // for Business-owned types we keep business in a separate field below.
  const fullName = await ownerName(owner);

  // Event/Promotion business card block (preserved shape from your previous util)
  let business = null;
  if ((type === 'event' || type === 'promotion') && post.placeId) {
    business = await businessFromPlaceId(post.placeId);
  }

  // Media thumb
  const { key, kind, directUrl } = pickFirstMedia(post);
  const mediaUrl = directUrl || (key ? await getPresignedUrl(key) : null);
  let mediaType = kind;

  // Special live payload
  if (type === 'liveStream') {
    mediaType = post.status === 'live' ? 'live' : (kind || 'video');
    return {
      postId,
      postType: post.type,
      canonicalType: type,
      fullName,
      business: null,
      mediaUrl,
      mediaType,
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

  // Shared → recursively preview the original (1 level)
  if (type === 'shared') {
    const originalId = post?.shared?.originalId;
    let original = originalId ? await Post.findById(originalId).lean() : null;

    // Optional: try legacy up-convert once if not found in unified store
    if (!original && legacyBridge?.upsertPostFromLegacy) {
      try {
        original = await legacyBridge.upsertPostFromLegacy(post?.shared?.originalType, originalId);
      } catch (_) {}
    }

    const originalPreview = original && depth < 1
      ? await buildPreviewFromUnified(original, depth + 1)
      : null;

    // Prefer original’s media/business for the shared card
    const sharedMediaUrl = originalPreview?.mediaUrl || mediaUrl || null;
    const sharedMediaType = originalPreview?.mediaType || mediaType || null;
    const sharedBusiness = originalPreview?.business || null;

    // Original owner name (User/Business)
    let originalOwnerName = '';
    if (original?.owner) originalOwnerName = await ownerName(original.owner);

    return {
      postId,
      postType: post.type,
      canonicalType: 'shared',
      fullName,                // sharer’s name
      business: sharedBusiness,
      mediaUrl: sharedMediaUrl,
      mediaType: sharedMediaType,
      shared: {
        caption: post?.shared?.caption || '',
        originalType: normType(post?.shared?.originalType || original?.type || ''),
        originalId: originalId || null,
        originalOwner: original?.owner ? {
          id: original.owner.id,
          model: original.owner.ref,
          name: originalOwnerName,
        } : null,
        originalPreview: originalPreview || null,
        createdAt: post.createdAt,
      },
    };
  }

  // Default (review, checkIn, invite, event, promotion)
  return {
    postId,
    postType: post.type,
    canonicalType: type,
    fullName,
    business,   // null unless event/promotion
    mediaUrl,
    mediaType,
  };
}

/* ---------------------------------- API ---------------------------------- */

/**
 * getPostPreviews(refs)
 * - Accepts:
 *   • [{ postId }] (preferred for unified)
 *   • ["<postId>"] (also ok)
 *   • [{ postType, postId }] (legacy compatibility; used only if the id isn't found in Post)
 * - Returns: array of preview objects (same shape you used before)
 */
const getPostPreviews = async (refs = []) => {
  const items = (refs || []).map((r) => {
    if (typeof r === 'string') return { postId: r };
    return { postId: r?.postId || r?.id, legacyType: r?.postType };
  }).filter((x) => !!x.postId);

  if (!items.length) return [];

  // Bulk fetch what we can from unified store
  const ids = [...new Set(items.map(i => i.postId))];
  const docs = await Post.find({ _id: { $in: ids } }).lean();
  const byId = new Map(docs.map(d => [String(d._id), d]));

  // For any missing id, try legacy up-convert (optional)
  if (legacyBridge?.upsertPostFromLegacy) {
    for (const it of items) {
      if (!byId.has(it.postId) && it.legacyType) {
        try {
          const up = await legacyBridge.upsertPostFromLegacy(it.legacyType, it.postId);
          if (up) byId.set(it.postId, up);
        } catch (_) {}
      }
    }
  }

  // Build previews
  const previews = await Promise.all(
    items.map(async (it) => {
      const doc = byId.get(it.postId);
      if (!doc) return null;
      try {
        return await buildPreviewFromUnified(doc);
      } catch (err) {
        console.warn(`⚠️ preview failed for ${it.postId}:`, err?.message);
        return null;
      }
    })
  );

  return previews.filter(Boolean);
};

module.exports = getPostPreviews;
