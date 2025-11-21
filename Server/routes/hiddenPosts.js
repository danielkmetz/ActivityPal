const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const HiddenPost = require('../models/HiddenPosts');
const { Post } = require('../models/Post');       // unified Post
const Event = require('../models/Events');         // separate model
const Promotion = require('../models/Promotions'); // separate model
const { hydrateManyPostsForResponse } = require('../utils/posts/hydrateAndEnrichForResponse');

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

/** Normalize any user-provided type string to our canonical unified type */
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
  if (s === 'promotion' || s === 'promotions' || s === 'promo' || s === 'promos') {
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

  return null;
}

/** Helper: fetch a doc by canonical type + id just to verify existence/type */
async function findDocByTypeAndId(type, id) {
  if (type === 'event') {
    return Event.findById(id).select('_id').lean();
  }
  if (type === 'promotion') {
    return Promotion.findById(id).select('_id').lean();
  }
  // Everything else is a Post-based type
  return Post.findById(id).select('_id type').lean();
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
    match.targetRef = qpType; // canonical only
  }

  try {
    const projection = { targetRef: 1, targetId: 1, createdAt: 1 };

    const [rows, total] = await Promise.all([
      HiddenPost.find(match, projection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HiddenPost.countDocuments(match),
    ]);

    // If the caller only wants ids, keep behavior identical
    if (include === 'ids') {
      return res.status(200).json({
        success: true,
        page,
        limit,
        total,
        items: rows.map((r) => ({
          hiddenId: r._id,
          targetRef: r.targetRef, // canonical
          targetId: r.targetId,
          createdAt: r.createdAt,
        })),
      });
    }

    // ---- include = 'docs' path: use new hydrator helpers ----

    // Canonical types that live in the unified Post collection
    const POST_CANON_TYPES = new Set([
      'review',
      'check-in',
      'invite',
      'sharedPost',
      'liveStream',
    ]);

    const idsByType = {
      post: [],
      promotion: [],
      event: [],
    };

    for (const r of rows) {
      const t = r.targetRef;          // canonical type
      const id = String(r.targetId);  // ObjectId -> string

      if (!id) continue;

      if (POST_CANON_TYPES.has(t)) {
        idsByType.post.push(id);
      } else if (t === 'promotion') {
        idsByType.promotion.push(id);
      } else if (t === 'event') {
        idsByType.event.push(id);
      } else {
        console.warn(`${TAG} warn: unknown targetRef on HiddenPost`, {
          at: now(),
          userId,
          targetRef: t,
          targetId: id,
        });
      }
    }

    // Batch-load raw docs
    const [postDocs, promoDocs, eventDocs] = await Promise.all([
      idsByType.post.length
        ? Post.find({ _id: { $in: idsByType.post } }).lean()
        : [],
      idsByType.promotion.length
        ? Promotion.find({ _id: { $in: idsByType.promotion } }).lean()
        : [],
      idsByType.event.length
        ? Event.find({ _id: { $in: idsByType.event } }).lean()
        : [],
    ]);

    // Flatten into a single array while tracking which canonical type
    const rawPosts = [];
    const typeMeta = []; // parallel array of canonical type strings

    for (const p of postDocs) {
      rawPosts.push(p);
      // p.type should already be 'review' | 'check-in' | 'invite' | 'liveStream' | 'sharedPost'
      typeMeta.push(normalizeUnifiedType(p.type));
    }

    for (const p of promoDocs) {
      rawPosts.push(p);
      typeMeta.push('promotion');
    }

    for (const p of eventDocs) {
      rawPosts.push(p);
      typeMeta.push('event');
    }

    let hydrated = [];
    if (rawPosts.length) {
      try {
        hydrated = await hydrateManyPostsForResponse(rawPosts, {
          viewerId: userId,
        });
      } catch (e) {
        console.error(`${TAG} warn: hydrateManyPostsForResponse failed`, {
          at: now(),
          userId,
          error: e?.message,
        });
        hydrated = [];
      }
    }

    // Build a map <"type:id", hydratedPost> so we can attach per HiddenPost row
    const enrichedByKey = new Map();

    for (let i = 0; i < rawPosts.length; i++) {
      const raw = rawPosts[i];
      const enriched = hydrated[i] || raw; // fallback: raw if hydration failed
      if (!raw) continue;

      const canonType =
        typeMeta[i] || normalizeUnifiedType(enriched.type || raw.type);

      const key = `${canonType}:${String(raw._id)}`;
      enrichedByKey.set(key, enriched);
    }

    const items = rows.map((r) => {
      const key = `${r.targetRef}:${String(r.targetId)}`;
      const postPayload = enrichedByKey.get(key) || null;

      if (!postPayload) {
        console.warn(`${TAG} warn: no hydrated post found for HiddenPost`, {
          at: now(),
          userId,
          targetRef: r.targetRef,
          targetId: String(r.targetId),
        });
      }

      return {
        hiddenId: r._id,
        targetRef: r.targetRef,
        targetId: r.targetId,
        createdAt: r.createdAt,
        post: postPayload,
      };
    });

    return res.status(200).json({ success: true, page, limit, total, items });
  } catch (err) {
    console.error(`${TAG} ❌ 500`, { at: now(), userId, message: err?.message });
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * POST /api/hidden/:postType/:postId
 * Hide a post globally for the current user
 * We store targetRef as the canonical type string.
 */
router.post('/:postType/:postId', verifyToken, async (req, res) => {
  const TAG = '[POST /hidden/:postType/:postId]';
  const userId = req.user?.id;
  const { postType: rawType, postId } = req.params || {};
  const reqType = normalizeUnifiedType(rawType);

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });
  if (!reqType || !CANON_TYPES.has(reqType)) {
    return res.status(400).json({ message: 'Invalid postType' });
  }

  try {
    const doc = await findDocByTypeAndId(reqType, postId);
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    // For Post-based types, sanity-check the Post.type if present
    if (reqType !== 'event' && reqType !== 'promotion' && doc.type && doc.type !== reqType) {
      return res
        .status(400)
        .json({ message: `Type mismatch: expected ${doc.type}, got ${reqType}` });
    }

    await HiddenPost.findOneAndUpdate(
      { userId, targetRef: reqType, targetId: postId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      ok: true,
      key: `${reqType}:${postId}`,
      hidden: true,
    });
  } catch (err) {
    console.error(`${TAG} ❌`, { rawType, postId, userId, err: err?.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE /api/hidden/:postType/:postId
 * Unhide a post
 */
router.delete('/:postType/:postId', verifyToken, async (req, res) => {
  const TAG = '[DELETE /hidden/:postType/:postId]';
  const userId = req.user?.id;
  const { postType: rawType, postId } = req.params || {};
  const reqType = normalizeUnifiedType(rawType);

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });
  if (!reqType || !CANON_TYPES.has(reqType)) {
    return res.status(400).json({ message: 'Invalid postType' });
  }

  try {
    await HiddenPost.deleteOne({
      userId,
      targetId: postId,
      targetRef: reqType,
    });

    return res.status(200).json({
      ok: true,
      key: `${reqType}:${postId}`,
      hidden: false,
    });
  } catch (err) {
    console.error(`${TAG} ❌`, { rawType, postId, userId, err: err?.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/hidden/keys
 * Boot-time hydration: keys are `${targetRef}:${id}`
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

    const keys = rows.map((r) => `${r.targetRef}:${String(r.targetId)}`);

    return res.status(200).json({ ok: true, keys });
  } catch (err) {
    console.error(`${TAG} ❌`, { userId, err: err?.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
