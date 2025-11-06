const express = require('express');
const mongoose = require('mongoose');
const HiddenTag = require('../models/HiddenTag');
const verifyToken = require('../middleware/verifyToken');
const { Post } = require('../models/Post'); // ✅ unified Post model
const { getPostPayloadById } = require('../utils/normalizePostStructure'); // ✅ 1-arg version (postId)

const router = express.Router();

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));

/* ----------------------------- Type helpers ----------------------------- */

// Canonical unified types we allow for "hidden tags"
// (kept to reviews/check-ins for feature parity; expand later if needed)
const ALLOWED_TYPES = new Set(['review', 'check-in']);

// Legacy ↔ canonical mappings (back-compat with old rows)
const LEGACY_TO_TYPE = { Review: 'review', CheckIn: 'check-in' };
const TYPE_TO_LEGACY = { review: 'Review', 'check-in': 'CheckIn' };

// For filtering HiddenTag.targetRef regardless of what was stored
const TYPE_ALIASES = {
  review: ['review', 'Review'],
  'check-in': ['check-in', 'CheckIn'],
};

function normalizeUnifiedType(t = '') {
  const s = String(t).trim().toLowerCase();
  if (s === 'review' || s === 'reviews') return 'review';
  if (s === 'check-in' || s === 'checkin' || s === 'check-ins' || s === 'checkins') return 'check-in';
  return null; // anything else not supported for hidden-tags (today)
}

function refToCanonical(ref = '') {
  if (!ref) return null;
  if (ALLOWED_TYPES.has(ref)) return ref;
  return LEGACY_TO_TYPE[ref] || null;
}

/* ------------------------------ Core utils ------------------------------ */

// Ensure the current user is tagged either at post-level or any media item
async function ensureUserIsTaggedUnified(postId, userId) {
  // Only fetch the fields we need
  const doc = await Post.findById(postId)
    .select('_id type taggedUsers media photos')
    .lean();
  if (!doc) return { ok: false, code: 404, message: 'Post not found' };

  const uid = String(userId);

  // Normalize any tag item to a string user id
  const toUserId = (t) => {
    if (!t) return '';
    if (typeof t === 'string' || typeof t === 'number') return String(t);
    // ObjectId
    if (t && typeof t === 'object' && typeof t.toString === 'function' && t._bsontype === 'ObjectID') {
      return t.toString();
    }
    // object shapes
    if (typeof t === 'object') {
      if (t.userId) return String(t.userId);
      if (t.id) return String(t.id);
      if (t._id) return String(t._id);
    }
    return '';
  };

  const hasUid = (arr) => Array.isArray(arr) && arr.some((t) => toUserId(t) === uid);

  const postTagged = hasUid(doc.taggedUsers);

  // Support either `media` or legacy `photos`
  const mediaArr = Array.isArray(doc.media)
    ? doc.media
    : (Array.isArray(doc.photos) ? doc.photos : []);

  const mediaTagged =
    Array.isArray(mediaArr) &&
    mediaArr.some((m) => hasUid(m?.taggedUsers));

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

  // Optional filter by canonical type (review/check-in)
  const qpType = normalizeUnifiedType(req.query.postType);
  const match = { userId: new mongoose.Types.ObjectId(String(userId)) };
  if (qpType) {
    const aliases = TYPE_ALIASES[qpType] || [qpType];
    match.targetRef = { $in: aliases };
  }

  try {
    const projection = { targetRef: 1, targetId: 1, createdAt: 1 };

    const [rows, total] = await Promise.all([
      HiddenTag.find(match, projection).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      HiddenTag.countDocuments(match),
    ]);

    if (include === 'ids') {
      return res.status(200).json({
        success: true,
        page,
        limit,
        total,
        items: rows.map((r) => ({
          hiddenId: r._id,
          // Return canonical type to the client
          postType: refToCanonical(r.targetRef) || String(r.targetRef || '').toLowerCase(),
          postId: r.targetId,
          createdAt: r.createdAt,
        })),
      });
    }

    // Batch-load posts to reduce roundtrips
    const ids = rows.map((r) => r.targetId).filter(Boolean);
    const posts = ids.length ? await Post.find({ _id: { $in: ids } }).lean() : [];
    const postMap = new Map(posts.map((p) => [p._id.toString(), p]));

    const items = await Promise.all(
      rows.map(async (r) => {
        const canonicalType = refToCanonical(r.targetRef) || r.targetRef;
        let post = null;

        try {
          const cached = postMap.get(String(r.targetId));
          if (cached) {
            // if your normalizer accepts a doc, you could pass it; we’ll use id for consistency
            post = await getPostPayloadById(cached._id);
          } else {
            post = await getPostPayloadById(r.targetId);
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
          postType: canonicalType,
          postId: r.targetId,
          createdAt: r.createdAt,
          post, // normalized payload or null if missing/deleted
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
 * POST /hidden-tags/:postType/:postId  -> Hide (only if the user is actually tagged)
 */
router.post('/:postType/:postId', verifyToken, async (req, res) => {
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

    const doc = await Post.findById(postId).select('_id type taggedUsers media').lean();
    if (!doc) return res.status(404).json({ message: 'Post not found' });
    if (doc.type !== reqType) {
      return res.status(400).json({ message: `Type mismatch: expected ${doc.type}, got ${reqType}` });
    }

    // Only allow if actually tagged
    const check = await ensureUserIsTaggedUnified(postId, userId);
    if (!check.ok) return res.status(check.code).json({ message: check.message });

    const userObjId = new mongoose.Types.ObjectId(String(userId));
    const postObjId = new mongoose.Types.ObjectId(String(postId));

    // ✅ Store canonical type going forward; schema should be flexible String.
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

    // Accept either canonical or legacy refs for deletion
    const aliases = TYPE_ALIASES[reqType] || [reqType];

    const del = await HiddenTag.findOneAndDelete({
      userId: userObjId,
      targetRef: { $in: aliases },
      targetId: postObjId,
    });

    return res.status(200).json({ success: true, hidden: false, removed: !!del });
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
    if (reqType) match.targetRef = { $in: TYPE_ALIASES[reqType] || [reqType] };

    const rows = await HiddenTag.find(match, { targetRef: 1, targetId: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .lean();

    const items = rows.map((r) => ({
      postType: refToCanonical(r.targetRef) || String(r.targetRef || '').toLowerCase(),
      postId: String(r.targetId),
      hiddenId: String(r._id),
      createdAt: r.createdAt,
    }));

    return res.status(200).json({ success: true, count: items.length, items });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

// POST /hidden-tags/:postId   (id-only)
router.post('/:postId', verifyToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user?.id;

  if (!mongoose.Types.ObjectId.isValid(String(postId))) {
    return res.status(400).json({ message: 'Invalid postId' });
  }

  try {
    const doc = await Post.findById(postId).select('_id type taggedUsers media').lean();
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    // only allow the same types you already permit for hidden-tags
    if (!ALLOWED_TYPES.has(doc.type)) {
      return res.status(400).json({ message: `Unsupported type for hidden-tags: ${doc.type}` });
    }

    // ensure the current user is actually tagged (post-level **or** media-level)
    const uid = String(userId);
    const postTagged =
      Array.isArray(doc.taggedUsers) &&
      doc.taggedUsers.some((t) =>
        // accept both legacy ["userId", ...] and unified [{userId}, ...] shapes
        String(t) === uid || String(t?.userId) === uid
      );
    const mediaTagged =
      Array.isArray(doc.media) &&
      doc.media.some(
        (m) =>
          Array.isArray(m?.taggedUsers) &&
          m.taggedUsers.some((t) => String(t?.userId) === uid)
      );
    if (!postTagged && !mediaTagged) {
      return res.status(400).json({ message: 'User is not tagged in this post' });
    }

    const userObjId = new mongoose.Types.ObjectId(uid);
    const postObjId = new mongoose.Types.ObjectId(String(postId));
    await HiddenTag.updateOne(
      { userId: userObjId, targetRef: doc.type, targetId: postObjId },
      { $setOnInsert: { userId: userObjId, targetRef: doc.type, targetId: postObjId } },
      { upsert: true, setDefaultsOnInsert: true, timestamps: true }
    );

    // Optional: return a key the client can normalize if it wants
    return res.status(200).json({ success: true, hidden: true, key: String(postId) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

// DELETE /hidden-tags/:postId   (id-only)
router.delete('/:postId', verifyToken, async (req, res) => {
  const { postId } = req.params;
  const userId = req.user?.id;

  if (!mongoose.Types.ObjectId.isValid(String(postId))) {
    return res.status(400).json({ message: 'Invalid postId' });
  }

  try {
    // look up the post to know its canonical type (for rows that store targetRef)
    const doc = await Post.findById(postId).select('_id type').lean();
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    const userObjId = new mongoose.Types.ObjectId(String(userId));
    const postObjId = new mongoose.Types.ObjectId(String(postId));
    const aliases = TYPE_ALIASES[doc.type] || [doc.type];

    const del = await HiddenTag.findOneAndDelete({
      userId: userObjId,
      targetRef: { $in: aliases },
      targetId: postObjId,
    });

    return res.status(200).json({ success: true, hidden: false, removed: !!del, key: String(postId) });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});


module.exports = router;
