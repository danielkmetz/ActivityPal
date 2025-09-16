const router = require('express').Router();
const verifyToken = require('../middleware/verifyToken');
const Promotion = require('../models/Promotions.js');
const Event = require('../models/Events.js');
const LiveStream = require('../models/LiveStream.js');
const Review = require('../models/Reviews.js');
const CheckIn = require('../models/CheckIns.js');
const ActivityInvite = require('../models/ActivityInvites.js');
const SharedPost = require('../models/SharedPost.js');
const User = require('../models/User.js');
const Business = require('../models/Business.js');

/* -------------------------------------------------------------------------- */
/*                               Local utilities                               */
/* -------------------------------------------------------------------------- */

const short = (v, n = 8) => (typeof v === 'string' ? v.slice(-n) : v);
const nowIso = () => new Date().toISOString();
const genRid = (prefix = 'like') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const redact = (obj) => {
  try {
    if (!obj || typeof obj !== 'object') return obj;
    const safe = JSON.parse(JSON.stringify(obj));
    const hide = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        const lk = k.toLowerCase();
        if (['authorization', 'cookie', 'cookies'].includes(lk)) o[k] = '[REDACTED]';
        if (lk.includes('secret') || lk.includes('token') || lk.includes('password')) {
          if (typeof o[k] === 'string') o[k] = `***${short(o[k], 4)}`;
          else o[k] = '[REDACTED]';
        }
        if (typeof o[k] === 'object') hide(o[k]);
      }
    };
    hide(safe);
    return safe;
  } catch {
    return { note: 'redaction_failed' };
  }
};

const mkLoggers = (rid) => {
  const base = `[likes:${rid}]`;
  return {
    log: (msg, extra) => console.log(base, msg, extra !== undefined ? redact(extra) : ''),
    warn: (msg, extra) => console.warn(base, msg, extra !== undefined ? redact(extra) : ''),
    err: (msg, extra) => console.error(base, msg, extra !== undefined ? redact(extra) : ''),
  };
};

/* -------------------------------------------------------------------------- */
/*                      Model map + owner resolver (local)                     */
/* -------------------------------------------------------------------------- */

// Map postType segment -> model
const MODEL_BY_TYPE = {
  promotions: Promotion,
  promos: Promotion,
  promo: Promotion,
  promotion: Promotion,

  events: Event,
  event: Event,

  liveStreams: LiveStream,
  live: LiveStream, // allow shorthand
  livestreams: LiveStream,

  reviews: Review,
  review: Review,

  checkins: CheckIn,
  'check-ins': CheckIn,
  checkIns: CheckIn,
  checkin: CheckIn,
  'check-in': CheckIn,

  invites: ActivityInvite,
  invite: ActivityInvite,

  sharedPosts: SharedPost,
  shared: SharedPost,
};

// Who owns each post type (for notification cleanup on UNLIKE)
const ownerResolvers = {
  promotions: async (doc) => {
    if (!doc?.placeId) return { ownerId: null, ownerRef: 'Business' };
    const biz = await Business.findOne({ placeId: doc.placeId }).select('_id').lean();
    return { ownerId: biz?._id || null, ownerRef: 'Business' };
  },
  promos: async (doc) => ownerResolvers.promotions(doc),
  promotion: async (doc) => ownerResolvers.promotions(doc),

  events: async (doc) => {
    if (!doc?.placeId) return { ownerId: null, ownerRef: 'Business' };
    const biz = await Business.findOne({ placeId: doc.placeId }).select('_id').lean();
    return { ownerId: biz?._id || null, ownerRef: 'Business' };
  },
  event: async (doc) => ownerResolvers.events(doc),

  liveStreams: async (doc) => ({ ownerId: String(doc?.hostUserId || ''), ownerRef: 'User' }),
  livestreams: async (doc) => ownerResolvers.liveStreams(doc),
  live: async (doc) => ownerResolvers.liveStreams(doc),

  reviews: async (doc) => ({ ownerId: String(doc?.userId || ''), ownerRef: 'User' }),
  review: async (doc) => ownerResolvers.reviews(doc),

  checkins: async (doc) => ({ ownerId: String(doc?.userId || ''), ownerRef: 'User' }),
  'check-ins': async (doc) => ownerResolvers.checkins(doc),
  checkIns: async (doc) => ownerResolvers.checkins(doc),
  checkin: async (doc) => ownerResolvers.checkins(doc),
  'check-in': async (doc) => ownerResolvers.checkins(doc),

  invites: async (doc) => ({ ownerId: String(doc?.senderId || ''), ownerRef: 'User' }),
  invite: async (doc) => ownerResolvers.invites(doc),

  sharedPosts: async (doc) => ({ ownerId: String(doc?.user || ''), ownerRef: 'User' }),
  shared: async (doc) => ownerResolvers.sharedPosts(doc),
};

/* -------------------------------------------------------------------------- */
/*                              Helper functions                               */
/* -------------------------------------------------------------------------- */

async function removeLikeNotification({ ownerRef, ownerId, userId, postId, postType }) {
  if (!ownerId) return;

  if (ownerRef === 'Business') {
    const biz = await Business.findById(ownerId);
    if (!biz) return;
    const idx = (biz.notifications || []).findIndex(
      (n) =>
        n?.type === 'like' &&
        String(n?.relatedId) === String(userId) &&
        String(n?.targetId) === String(postId) &&
        n?.postType === postType
    );
    if (idx !== -1) {
      biz.notifications.splice(idx, 1);
      await biz.save();
    }
  } else {
    const user = await User.findById(ownerId);
    if (!user) return;
    const idx = (user.notifications || []).findIndex(
      (n) =>
        n?.type === 'like' &&
        String(n?.relatedId) === String(userId) &&
        String(n?.targetId) === String(postId) &&
        n?.postType === postType
    );
    if (idx !== -1) {
      user.notifications.splice(idx, 1);
      await user.save();
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                   */
/* -------------------------------------------------------------------------- */

/**
 * Toggle like for any supported post type.
 * POST /likes/:postType/:postId/like
 */
router.post('/:postType/:postId/like', verifyToken, async (req, res) => {
  const rid = genRid('tgl');
  const { log, warn, err } = mkLoggers(rid);
  res.set('X-Request-Id', rid);

  try {
    const { postType, postId } = req.params;

    const Model = MODEL_BY_TYPE[postType];
    if (!Model) return res.status(400).json({ message: `Unsupported postType: ${postType}`, rid });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized', rid });

    const fullName =
      (typeof req.user?.fullName === 'string' && req.user.fullName.trim()) ||
      [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') ||
      'Unknown';

    const doc = await Model.findById(postId);
    if (!doc) return res.status(404).json({ message: 'Post not found', rid });

    // Normalize likes array
    doc.likes = Array.isArray(doc.likes) ? doc.likes : [];

    const idx = doc.likes.findIndex((l) => String(l.userId) === String(userId));
    const isUnliking = idx > -1;

    if (isUnliking) {
      doc.likes.splice(idx, 1);
    } else {
      doc.likes.push({ userId, fullName, date: new Date() });
    }

    await doc.save();

    if (isUnliking) {
      // Remove existing like notification if it exists
      try {
        const resolver = ownerResolvers[postType];
        if (typeof resolver === 'function') {
          const { ownerId, ownerRef } = await resolver(doc);
          if (ownerId && String(ownerId) !== String(userId)) {
            await removeLikeNotification({
              ownerRef,
              ownerId,
              userId,
              postId: doc._id,
              postType,
            });
          }
        }
      } catch (e) {
        warn('removeLikeNotification err (continuing)', { err: e?.message });
      }
    }

    return res.json({
      ok: true,
      message: isUnliking ? 'Like removed' : 'Like added',
      postType,
      postId: String(doc._id),
      liked: !isUnliking,
      likes: doc.likes,
      likesCount: doc.likes.length,
      rid,
    });
  } catch (e) {
    err('toggleLike error', { msg: e?.message, stack: e?.stack, params: req.params });
    return res.status(500).json({ message: 'Internal Server Error', rid });
  }
});

/**
 * Convenience alias specifically for live streams
 * POST /likes/live/:id/like
 * (Equivalent to POST /likes/liveStreams/:id/like)
 */
router.post('/live/:id/like', verifyToken, async (req, res) => {
  // Rewrite params and forward to the unified handler
  req.params.postType = 'liveStreams';
  req.params.postId = req.params.id;
  delete req.params.id;
  return router.handle(req, res);
});

module.exports = router;
