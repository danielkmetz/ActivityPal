const router = require('express').Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const { Post } = require('../models/Post');
const Event = require('../models/Events');
const Promotion = require('../models/Promotions');
const User = require('../models/User');
const Business = require('../models/Business');

/* -------------------------------------------------------------------------- */
/* Utils                                                                      */
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

const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));

/* -------------------------------------------------------------------------- */
/* Model + type helpers                                                       */
/* -------------------------------------------------------------------------- */

// Accept a wide set of type aliases and map them to the underlying model.
const MODEL_MAP = {
  // unified Post (all social “post-like” things)
  post: Post, posts: Post,
  review: Post, reviews: Post,
  'check-in': Post, checkin: Post, checkins: Post,
  invite: Post, invites: Post,
  sharedpost: Post, sharedposts: Post,
  livestream: Post, livestreams: Post, 'live-stream': Post, 'live-streams': Post,

  // separate top-level models
  event: Event, events: Event,
  promotion: Promotion, promotions: Promotion,
};

const cleanType = (t='') => String(t).trim().toLowerCase();

function getModelByType(type) {
  const key = cleanType(type);
  return MODEL_MAP[key] || null;
}

function typeLabel(type) {
  const t = cleanType(type);
  if (t.startsWith('event')) return 'event';
  if (t.startsWith('promotion')) return 'promotion';
  return 'post';
}

// Best-effort owner resolution for notifications
function resolveOwner(doc) {
  const ownerId =
    doc?.ownerId ||
    doc?.userId ||                 // some older docs
    doc?.hostUserId ||             // live streams
    doc?.senderId ||               // invites
    doc?.createdBy || null;

  const ownerModel =
    doc?.ownerModel ||
    (doc?.businessId ? 'Business' : 'User'); // crude fallback

  return { ownerId: ownerId ? String(ownerId) : null, ownerModel };
}

/* -------------------------------------------------------------------------- */
/* Notifications (server-driven; comment out if client already handles them)  */
/* -------------------------------------------------------------------------- */

function findLikeNotifIndex(notifs = [], { likerId, targetId, targetType }) {
  return notifs.findIndex(
    (n) =>
      n?.type === 'like' &&
      String(n?.relatedId) === String(likerId) &&
      String(n?.targetId) === String(targetId) &&
      n?.postType === targetType
  );
}

async function addLikeNotification({ doc, likerId, likerName, targetType }) {
  const { ownerId, ownerModel } = resolveOwner(doc);
  if (!ownerId || String(ownerId) === String(likerId)) return;

  const payload = {
    type: 'like',
    message: `${likerName} liked your ${targetType}`,
    relatedId: likerId,
    typeRef: 'User',
    targetId: doc._id,
    targetRef: targetType === 'post' ? 'Post' : targetType === 'event' ? 'Event' : 'Promotion',
    commentId: null,
    replyId: null,
    read: false,
    postType: targetType,
    createdAt: new Date(),
  };

  if (ownerModel === 'Business') {
    const biz = await Business.findById(ownerId);
    if (!biz) return;
    biz.notifications = biz.notifications || [];
    const idx = findLikeNotifIndex(biz.notifications, { likerId, targetId: doc._id, targetType });
    if (idx === -1) {
      biz.notifications.push(payload);
      await biz.save();
    }
  } else {
    const user = await User.findById(ownerId);
    if (!user) return;
    user.notifications = user.notifications || [];
    const idx = findLikeNotifIndex(user.notifications, { likerId, targetId: doc._id, targetType });
    if (idx === -1) {
      user.notifications.push(payload);
      await user.save();
    }
  }
}

async function removeLikeNotification({ doc, likerId, targetType }) {
  const { ownerId, ownerModel } = resolveOwner(doc);
  if (!ownerId) return;

  if (ownerModel === 'Business') {
    const biz = await Business.findById(ownerId);
    if (!biz) return;
    const idx = findLikeNotifIndex(biz.notifications || [], {
      likerId,
      targetId: doc._id,
      targetType,
    });
    if (idx !== -1) {
      biz.notifications.splice(idx, 1);
      await biz.save();
    }
  } else {
    const user = await User.findById(ownerId);
    if (!user) return;
    const idx = findLikeNotifIndex(user.notifications || [], {
      likerId,
      targetId: doc._id,
      targetType,
    });
    if (idx !== -1) {
      user.notifications.splice(idx, 1);
      await user.save();
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Core toggle                                                                */
/* -------------------------------------------------------------------------- */

async function toggleLikeOnDoc({ Model, id, user, targetType, log, warn }) {
  const doc = await Model.findById(id);
  if (!doc) return { status: 404, body: { message: `${targetType} not found` } };

  doc.likes = Array.isArray(doc.likes) ? doc.likes : [];
  const likerId = user.id;
  const likerName =
    (typeof user.fullName === 'string' && user.fullName.trim()) ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    'Unknown';

  const idx = doc.likes.findIndex((l) => String(l.userId) === String(likerId));
  const isUnliking = idx > -1;

  if (isUnliking) {
    doc.likes.splice(idx, 1);
  } else {
    doc.likes.push({ userId: likerId, fullName: likerName, date: new Date() });
  }
  await doc.save();

  // Server-driven notifications (comment out if client handles it)
  try {
    if (isUnliking) {
      await removeLikeNotification({ doc, likerId, targetType });
    } else {
      await addLikeNotification({ doc, likerId, likerName, targetType });
    }
  } catch (e) {
    warn('notification step failed (continuing)', { err: e?.message });
  }

  // ✅ Payload matches legacy: { ok, message, postId, liked, likes, likesCount, rid }
  return {
    status: 200,
    body: {
      ok: true,
      message: isUnliking ? 'Like removed' : 'Like added',
      postId: String(doc._id),
      liked: !isUnliking,
      likes: doc.likes,
      likesCount: doc.likes.length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Generic: POST /likes/:type/:id/like
 *   type ∈ posts|reviews|checkins|invites|sharedPosts|liveStreams|events|promotions
 *   All *post-like* types are mapped to the Post model internally.
 */
router.post('/:type/:id/like', verifyToken, async (req, res) => {
  const rid = genRid('tgl');
  const { log, warn, err } = mkLoggers(rid);
  res.set('X-Request-Id', rid);

  try {
    const { type, id } = req.params;
    if (!isOid(id)) return res.status(400).json({ message: 'Invalid id', rid });
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized', rid });

    const Model = getModelByType(type);
    if (!Model) return res.status(400).json({ message: 'Unsupported type', type, rid });

    const targetType = typeLabel(type);
    const { status, body } = await toggleLikeOnDoc({
      Model, id, user: req.user, targetType, log, warn,
    });

    return res.status(status).json({ ...body, rid });
  } catch (e) {
    err('toggleLike error', { msg: e?.message, stack: e?.stack, params: req.params });
    return res.status(500).json({ message: 'Internal Server Error', rid });
  }
});

/**
 * Back-compat:
 *   POST /likes/:postId/like        → /likes/posts/:postId/like
 *   POST /likes/live/:id/like       → /likes/posts/:id/like
 *   POST /likes/events/:id/like     → /likes/events/:id/like (explicit)
 *   POST /likes/promotions/:id/like → /likes/promotions/:id/like (explicit)
 */
router.post('/:postId/like', verifyToken, (req, res, next) => {
  req.params.type = 'posts';
  req.params.id = req.params.postId;
  delete req.params.postId;
  next();
}, router);

router.post('/live/:id/like', verifyToken, (req, res, next) => {
  req.params.type = 'posts';
  next();
}, router);

// These two work directly through the generic handler above,
// kept here just for clarity of available endpoints:
router.post('/events/:id/like', verifyToken, (req, res, next) => next(), router);
router.post('/promotions/:id/like', verifyToken, (req, res, next) => next(), router);

module.exports = router;
