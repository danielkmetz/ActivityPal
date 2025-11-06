const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const HiddenPost = require('../models/HiddenPosts');
const { Post } = require('../models/Post'); // ✅ unified Post (with discriminators)
const { getPostPayloadById } = require('../utils/normalizePostStructure'); // ✅ assumes updated to 1-arg (postId)

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));

/** Canonical unified post types we support */
const CANON_TYPES = new Set([
  'review',
  'check-in',
  'invite',
  'event',
  'promotion',
  'sharedPost',
  'liveStream',
]);

/** Map legacy model names -> unified type (for backward compatibility of HiddenPost.targetRef) */
const LEGACY_TO_TYPE = {
  Review: 'review',
  CheckIn: 'check-in',
  ActivityInvite: 'invite',
  Event: 'event',
  Promotion: 'promotion',
  SharedPost: 'sharedPost',
  LiveStream: 'liveStream',
};

/** For filtering by query param: type -> [aliases accepted in HiddenPost.targetRef] */
const TYPE_ALIASES = {
  review: ['review', 'Review'],
  'check-in': ['check-in', 'CheckIn'],
  invite: ['invite', 'ActivityInvite'],
  event: ['event', 'Event'],
  promotion: ['promotion', 'Promotion'],
  sharedPost: ['sharedPost', 'SharedPost'],
  liveStream: ['liveStream', 'LiveStream'],
};

/** Normalize any user-provided type string to our canonical unified type */
function normalizeUnifiedType(t = '') {
  const s = String(t).trim().toLowerCase();
  if (!t) return null;
  if (s === 'review' || s === 'reviews') return 'review';
  if (s === 'check-in' || s === 'checkin' || s === 'checkins') return 'check-in';
  if (s === 'invite' || s === 'invites' || s === 'activityinvite') return 'invite';
  if (s === 'event' || s === 'events') return 'event';
  if (s === 'promotion' || s === 'promotions' || s === 'promo' || s === 'promos') return 'promotion';
  if (s === 'sharedpost' || s === 'sharedposts' || s === 'shared') return 'sharedPost';
  if (s === 'livestream' || s === 'live' || s === 'live_stream') return 'liveStream';
  return null;
}

/** Convert any HiddenPost.targetRef (legacy or unified) to canonical type */
function refToType(ref = '') {
  if (CANON_TYPES.has(ref)) return ref;
  return LEGACY_TO_TYPE[ref] || null;
}

/**
 * GET /api/hidden
 * Returns enriched hidden posts OR ids depending on ?include=docs|ids
 * Supports optional ?postType=review|check-in|sharedPost|invite|event|promotion|liveStream
 * Supports pagination (page, limit)
 */
router.get('/', verifyToken, async (req, res) => {
  const TAG = '[GET /hidden]';
  const now = () => new Date().toISOString();

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const include = (req.query.include || 'docs').toLowerCase() === 'ids' ? 'ids' : 'docs';
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(limitRaw || 20, 1), 100);
  const skip = (page - 1) * limit;

  // Optional type filter
  const qpType = normalizeUnifiedType(req.query.postType);
  const match = { userId: new mongoose.Types.ObjectId(String(userId)) };
  if (qpType) {
    const aliases = TYPE_ALIASES[qpType] || [qpType];
    match.targetRef = { $in: aliases };
  }

  try {
    const projection = { targetRef: 1, targetId: 1, createdAt: 1 };

    const [rows, total] = await Promise.all([
      HiddenPost.find(match, projection).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      HiddenPost.countDocuments(match),
    ]);

    if (include === 'ids') {
      return res.status(200).json({
        success: true,
        page,
        limit,
        total,
        items: rows.map((r) => ({
          hiddenId: r._id,
          // Return the canonical type for client consistency
          targetRef: refToType(r.targetRef) || r.targetRef,
          targetId: r.targetId,
          createdAt: r.createdAt,
        })),
      });
    }

    // Batch-load posts to minimize roundtrips
    const ids = rows.map((r) => r.targetId).filter(Boolean);
    const posts = ids.length
      ? await Post.find({ _id: { $in: ids } }).lean()
      : [];
    const postMap = new Map(posts.map((p) => [p._id.toString(), p]));

    const items = await Promise.all(
      rows.map(async (r) => {
        const canonicalType = refToType(r.targetRef) || r.targetRef;
        let postPayload = null;

        try {
          // Prefer the already-fetched doc if available, else let the utility fetch it
          const doc = postMap.get(String(r.targetId));
          if (doc) {
            // If your getPostPayloadById can accept a doc, use that; otherwise call by id.
            postPayload = await getPostPayloadById(doc._id); // 1-arg version (unified)
          } else {
            postPayload = await getPostPayloadById(r.targetId);
          }
        } catch (e) {
          console.error(`${TAG} warn: failed to build payload`, {
            at: now(),
            userId,
            targetId: String(r.targetId),
            message: e?.message,
          });
        }

        return {
          hiddenId: r._id,
          targetRef: canonicalType,
          targetId: r.targetId,
          createdAt: r.createdAt,
          post: postPayload,
        };
      })
    );

    return res.status(200).json({ success: true, page, limit, total, items });
  } catch (err) {
    console.error(`${TAG} ❌ 500`, { at: now(), userId, message: err?.message });
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * POST /api/hidden/:postType/:postId
 * Hide a post globally for the current user
 * With unified Post, we always store targetRef as the canonical type string.
 */
router.post('/:postType/:postId', verifyToken, async (req, res) => {
  const TAG = '[POST /hidden/:postType/:postId]';
  const userId = req.user?.id;
  const { postType: rawType, postId } = req.params || {};
  const reqType = normalizeUnifiedType(rawType);

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });
  if (!reqType) return res.status(400).json({ message: 'Invalid postType' });

  try {
    const doc = await Post.findById(postId).select('_id type').lean();
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    // Ensure requested type matches actual type (or at least don't store a wrong ref)
    const canonicalType = CANON_TYPES.has(doc.type) ? doc.type : reqType;

    await HiddenPost.findOneAndUpdate(
      { userId, targetRef: canonicalType, targetId: postId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );

    return res.status(200).json({ ok: true, key: `${canonicalType}:${postId}`, hidden: true });
  } catch (err) {
    console.error(`${TAG} ❌`, { rawType, postId, userId, err: err?.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/hidden/:postType/:postId
 * Unhide a post
 * We delete by (userId, targetId) and either canonical type or any legacy alias that could have been stored.
 */
router.delete('/:postType/:postId', verifyToken, async (req, res) => {
  const TAG = '[DELETE /hidden/:postType/:postId]';
  const userId = req.user?.id;
  const { postType: rawType, postId } = req.params || {};
  const reqType = normalizeUnifiedType(rawType);

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });
  if (!reqType) return res.status(400).json({ message: 'Invalid postType' });

  try {
    // Accept both canonical and legacy ref values in case of old rows
    const aliases = TYPE_ALIASES[reqType] || [reqType];

    await HiddenPost.deleteOne({
      userId,
      targetId: postId,
      targetRef: { $in: aliases },
    });

    return res.status(200).json({ ok: true, key: `${reqType}:${postId}`, hidden: false });
  } catch (err) {
    console.error(`${TAG} ❌`, { rawType, postId, userId, err: err?.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/hidden/keys
 * List all hidden keys for the current user (for boot-time hydration)
 * Keys are `${canonicalType}:${id}` — we canonicalize legacy targetRef values too.
 */
router.get('/keys', verifyToken, async (req, res) => {
  const TAG = '[GET /hidden/keys]';
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const rows = await HiddenPost.find(
      { userId },
      { targetRef: 1, targetId: 1, _id: 0 }
    ).lean();

    const keys = rows.map((r) => {
      const type = refToType(r.targetRef) || r.targetRef;
      return `${type}:${String(r.targetId)}`;
    });

    return res.status(200).json({ ok: true, keys });
  } catch (err) {
    console.error(`${TAG} ❌`, { userId, err: err?.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
