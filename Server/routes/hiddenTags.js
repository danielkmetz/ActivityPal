const express = require('express');
const mongoose = require('mongoose');
const HiddenTag = require('../models/HiddenTag');
const verifyToken = require('../middleware/verifyToken');
const { Post } = require('../models/Post'); // unified Post model
const { getModelByType } = require('../utils/getModelByType');
const { hydrateManyPostsForResponse } = require('../utils/posts/hydrateAndEnrichForResponse');
const router = express.Router();

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));

/* ----------------------------- Type helpers ----------------------------- */

const ALLOWED_TYPES = new Set(['review', 'check-in', 'invite', 'promotion', 'event', 'sharedPost', 'liveStream']);

function normalizeUnifiedType(t = '') {
  if (!t) return null;
  const s = String(t).trim().toLowerCase();

  // reviews
  if (s === 'review' || s === 'reviews') return 'review';

  // check-ins
  if (s === 'check-in' || s === 'checkin' || s === 'check-ins' || s === 'checkins') {
    return 'check-in';
  }

  // invites
  if (s === 'invite' || s === 'invites' || s === 'activityinvite' || s === 'activity_invite') {
    return 'invite';
  }

  // promotions
  if (
    s === 'promotion' ||
    s === 'promotions' ||
    s === 'promo' ||
    s === 'promos'
  ) {
    return 'promotion';
  }

  // events
  if (s === 'event' || s === 'events') {
    return 'event';
  }

  // shared posts
  if (
    s === 'sharedpost' ||
    s === 'sharedposts' ||
    s === 'shared_post' ||
    s === 'shared_posts' ||
    s === 'shared'
  ) {
    return 'sharedPost';
  }

  // live streams
  if (
    s === 'livestream' ||
    s === 'live_stream' ||
    s === 'live-stream' ||
    s === 'live'
  ) {
    return 'liveStream';
  }

  // anything else not supported
  return null;
}

/* ------------------------------ Core utils ------------------------------ */

// Ensure the current user is tagged either at post-level or any media item
async function ensureUserIsTaggedUnified(postId, userId) {
  const doc = await Post.findById(postId)
    .select('_id type ownerId taggedUsers media')
    .lean();

  if (!doc) {
    return { ok: false, code: 404, message: 'Post not found' };
  }

  const uid = String(userId);

  const toUserId = (t) => {
    if (!t) return '';

    // plain string / number
    if (typeof t === 'string' || typeof t === 'number') {
      return String(t);
    }

    // Mongoose ObjectId (even in lean docs)
    if (t instanceof mongoose.Types.ObjectId) {
      return String(t);
    }

    // Some BSON ObjectId shapes keep _bsontype, be defensive
    if (t && typeof t === 'object' && typeof t.toString === 'function') {
      if (t._bsontype && t._bsontype.toLowerCase() === 'objectid') {
        return t.toString();
      }
    }

    // Subdocs with userId / id / _id (e.g. PhotoSchema.taggedUsers)
    if (typeof t === 'object') {
      if (t.userId) return String(t.userId);  // ✅ your PhotoSchema
      if (t.id) return String(t.id);
      if (t._id) return String(t._id);
    }

    return '';
  };

  const hasUid = (arr) =>
    Array.isArray(arr) && arr.some((t) => toUserId(t) === uid);

  // Post-level taggedUsers: [ObjectId]
  const postTagged = hasUid(doc.taggedUsers);

  // Photo-level tags: media[].taggedUsers: [{ userId, x, y }]
  const mediaTagged =
    Array.isArray(doc.media) &&
    doc.media.some((m) => hasUid(m && m.taggedUsers));

  if (!postTagged && !mediaTagged) {
    return { ok: false, code: 400, message: 'User is not tagged in this post' };
  }

  return { ok: true, doc };
}

/* ================================= Routes ================================ */

/**
 * GET /hidden-tags?postType=review|check-in&include=ids|docs&page=1&limit=20
 */
router.get('/', verifyToken, async (req, res) => {
  const TAG = '[GET /hidden-tags]';
  const now = () => new Date().toISOString();

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const include = (req.query.include || 'docs').toLowerCase() === 'ids' ? 'ids' : 'docs';
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(limitRaw || 20, 1), 100);
  const skip = (page - 1) * limit;

  // Optional filter by canonical type (review/check-in/etc.)
  const qpType = normalizeUnifiedType(req.query.postType);
  const match = { userId: new mongoose.Types.ObjectId(String(userId)) };
  if (qpType) {
    match.targetRef = qpType; // canonical only
  }

  try {
    const projection = { targetRef: 1, targetId: 1, createdAt: 1 };

    const [rows, total] = await Promise.all([
      HiddenTag.find(match, projection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HiddenTag.countDocuments(match),
    ]);

    // --- ids-only shortcut (no post hydration) ---
    if (include === 'ids') {
      return res.status(200).json({
        success: true,
        page,
        limit,
        total,
        items: rows.map((r) => ({
          hiddenId: r._id,
          postType: r.targetRef, // already canonical
          postId: r.targetId,
          createdAt: r.createdAt,
        })),
      });
    }

    // --- docs branch: hydrate posts with the new helper ---

    // targetIds in the same order as rows
    const ids = rows
      .map((r) => (r.targetId ? String(r.targetId) : null))
      .filter(Boolean);

    if (!ids.length) {
      return res.status(200).json({
        success: true,
        page,
        limit,
        total,
        items: rows.map((r) => ({
          hiddenId: r._id,
          postType: r.targetRef,
          postId: r.targetId,
          createdAt: r.createdAt,
          post: null,
        })),
      });
    }

    // Load raw posts once
    const posts = await Post.find({ _id: { $in: ids } }).lean();

    // Preserve row order when hydrating
    const postMap = new Map(posts.map((p) => [String(p._id), p]));
    const orderedPosts = ids
      .map((id) => postMap.get(id))
      .filter(Boolean);

    // Use your new batch hydrator (handles shared, events, promos, live, etc.)
    const hydratedPosts = await hydrateManyPostsForResponse(orderedPosts, {
      viewerId: userId,
      // attachBusinessNameIfMissing: yourFnIfYouHaveOne
    });

    // Map back by _id for fast lookup when building items
    const hydratedMap = new Map(
      hydratedPosts.map((p) => [String(p._id), p])
    );

    const items = rows.map((r) => ({
      hiddenId: r._id,
      postType: r.targetRef,
      postId: r.targetId,
      createdAt: r.createdAt,
      post: hydratedMap.get(String(r.targetId)) || null,
    }));

    return res.status(200).json({ success: true, page, limit, total, items });
  } catch (err) {
    console.error(`${TAG} ❌ 500`, { at: now(), userId, message: err?.message });
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * POST /hidden-tags/:postType/:postId  -> Hide (only if the user is actually tagged)
 */
router.post('/:postType/:postId', verifyToken, async (req, res) => {
  const { postType, postId } = req.params;
  console.log('post type', postType);
  console.log('post id', postId);
  const userId = req.user?.id;

  try {
    if (!isValidObjectId(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }

    const reqType = normalizeUnifiedType(postType);
    if (!reqType || !ALLOWED_TYPES.has(reqType)) {
      return res.status(400).json({ message: 'Invalid postType' });
    }

    const Model = getModelByType(reqType);

    const doc = await Model.findById(postId)
      .select('_id type')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    if (doc.type !== reqType) {
      return res
        .status(400)
        .json({ message: `Type mismatch: expected ${doc.type}, got ${reqType}` });
    }

    // Only allow if actually tagged
    const check = await ensureUserIsTaggedUnified(postId, userId);
    if (!check.ok) return res.status(check.code).json({ message: check.message });

    const userObjId = new mongoose.Types.ObjectId(String(userId));
    const postObjId = new mongoose.Types.ObjectId(String(postId));

    await HiddenTag.updateOne(
      { userId: userObjId, targetRef: reqType, targetId: postObjId },
      { $setOnInsert: { userId: userObjId, targetRef: reqType, targetId: postObjId } },
      {
        upsert: true,
        setDefaultsOnInsert: true,
        timestamps: true,
      }
    );

    return res.status(200).json({ success: true, hidden: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * DELETE /hidden-tags/:postType/:postId  -> Unhide
 */
router.delete('/:postType/:postId', verifyToken, async (req, res) => {
  const { postType, postId } = req.params;
  const userId = req.user?.id;

  try {
    if (!isValidObjectId(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }

    const reqType = normalizeUnifiedType(postType);
    if (!reqType || !ALLOWED_TYPES.has(reqType)) {
      return res.status(400).json({ message: 'Invalid postType' });
    }

    const userObjId = new mongoose.Types.ObjectId(String(userId));
    const postObjId = new mongoose.Types.ObjectId(String(postId));

    const del = await HiddenTag.findOneAndDelete({
      userId: userObjId,
      targetRef: reqType,
      targetId: postObjId,
    });

    return res
      .status(200)
      .json({ success: true, hidden: false, removed: !!del });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * GET /hidden-tags/ids?postType=review|check-in
 * Simple key list for boot hydration
 */
router.get('/ids', verifyToken, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const reqType = normalizeUnifiedType(req.query.postType); // 'review' | 'check-in' | null

    const match = { userId: new mongoose.Types.ObjectId(String(userId)) };
    if (reqType) match.targetRef = reqType;

    const rows = await HiddenTag.find(
      match,
      { targetRef: 1, targetId: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .lean();

    const items = rows.map((r) => ({
      postType: r.targetRef,
      postId: String(r.targetId),
      hiddenId: String(r._id),
      createdAt: r.createdAt,
    }));

    return res
      .status(200)
      .json({ success: true, count: items.length, items });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * POST /hidden-tags/:postId   (id-only)
 * Infer postType from the Post doc (review/check-in).
 */
router.post('/:postId', verifyToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user?.id;

  if (!mongoose.Types.ObjectId.isValid(String(postId))) {
    return res.status(400).json({ message: 'Invalid postId' });
  }

  try {
    const check = await ensureUserIsTaggedUnified(postId, userId);
    if (!check.ok) return res.status(check.code).json({ message: check.message });

    const doc = check.doc; // has type

    if (!ALLOWED_TYPES.has(doc.type)) {
      return res
        .status(400)
        .json({ message: `Unsupported type for hidden-tags: ${doc.type}` });
    }

    const userObjId = new mongoose.Types.ObjectId(String(userId));
    const postObjId = new mongoose.Types.ObjectId(String(postId));

    await HiddenTag.updateOne(
      { userId: userObjId, targetRef: doc.type, targetId: postObjId },
      { $setOnInsert: { userId: userObjId, targetRef: doc.type, targetId: postObjId } },
      { upsert: true, setDefaultsOnInsert: true, timestamps: true }
    );

    return res.status(200).json({
      success: true,
      hidden: true,
      key: String(postId),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * DELETE /hidden-tags/:postId   (id-only)
 */
router.delete('/:postId', verifyToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user?.id;

  if (!mongoose.Types.ObjectId.isValid(String(postId))) {
    return res.status(400).json({ message: 'Invalid postId' });
  }

  try {
    const doc = await Post.findById(postId).select('_id type').lean();
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    // Optional: only touch rows for supported types
    if (!ALLOWED_TYPES.has(doc.type)) {
      return res
        .status(400)
        .json({ message: `Unsupported type for hidden-tags: ${doc.type}` });
    }

    const userObjId = new mongoose.Types.ObjectId(String(userId));
    const postObjId = new mongoose.Types.ObjectId(String(postId));

    const del = await HiddenTag.findOneAndDelete({
      userId: userObjId,
      targetRef: doc.type,
      targetId: postObjId,
    });

    return res.status(200).json({
      success: true,
      hidden: false,
      removed: !!del,
      key: String(postId),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

module.exports = router;
