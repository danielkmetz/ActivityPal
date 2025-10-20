const express = require('express');
const mongoose = require('mongoose');
const HiddenTag = require('../models/HiddenTag');
const verifyToken = require('../middleware/verifyToken');
const { getModelByType } = require('../utils/getModelByType');
const { getPostPayloadById } = require('../utils/normalizePostStructure');
const { normalizeTypeRef } = require('../utils/normalizeTypeRef');

const router = express.Router();

const REF_TO_RAW = { Review: 'review', CheckIn: 'check-in' };

// GET /hidden-tags?postType=review|check-in&include=ids|docs&page=1&limit=20
router.get('/', verifyToken, async (req, res) => {
  const TAG = '[GET /hidden-tags]';
  const now = () => new Date().toISOString();

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const typeRef = normalizeTypeRef(req.query.postType); // => 'Review' | 'CheckIn' | null
  const include = (req.query.include || 'docs').toLowerCase() === 'ids' ? 'ids' : 'docs';

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(limitRaw || 20, 1), 100);
  const skip = (page - 1) * limit;

  try {
    const match = { userId: new mongoose.Types.ObjectId(String(userId)) };
    if (typeRef) match.targetRef = typeRef;

    const projection = { targetRef: 1, targetId: 1, createdAt: 1 };

    const [rows, total] = await Promise.all([
      HiddenTag.find(match, projection).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      HiddenTag.countDocuments(match),
    ]);

    // Fast path: only IDs requested
    if (include === 'ids') {
      return res.status(200).json({
        success: true,
        page,
        limit,
        total,
        items: rows.map((r) => ({
          hiddenId: r._id,
          targetRef: r.targetRef, // 'Review' | 'CheckIn'
          targetId: r.targetId,
          createdAt: r.createdAt,
        })),
      });
    }

    // Build normalized payloads using your helper
    const items = await Promise.all(
      rows.map(async (r) => {
        const rawType = REF_TO_RAW[r.targetRef]; // 'review' | 'check-in'
        let post = null;
        try {
          post = await getPostPayloadById(rawType, r.targetId);
        } catch (e) {
          console.error(`${TAG} warn: failed to build payload`, {
            at: now(),
            userId,
            rawType,
            targetId: String(r.targetId),
            message: e?.message,
          });
        }
        return {
          hiddenId: r._id,
          targetRef: r.targetRef,
          targetId: r.targetId,
          createdAt: r.createdAt,
          post, // normalized post payload or null if missing/deleted
        };
      })
    );

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      items,
    });
  } catch (err) {
    console.error(`${TAG} ❌ 500`, { at: now(), userId, message: err?.message });
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

// Utility: ensure the user is actually tagged in this post
async function ensureUserIsTagged(Model, postId, userId) {
  const doc = await Model.findById(postId).lean();
  if (!doc) return { ok: false, code: 404, message: 'Post not found' };

  const uidStr = String(userId);

  const postTagged =
    Array.isArray(doc.taggedUsers) &&
    doc.taggedUsers.some((id) => String(id) === uidStr);

  const photoTagged =
    Array.isArray(doc.photos) &&
    doc.photos.some(
      (p) =>
        Array.isArray(p?.taggedUsers) &&
        p.taggedUsers.some((t) => String(t?.userId) === uidStr)
    );

  if (!postTagged && !photoTagged) {
    return { ok: false, code: 400, message: 'User is not tagged in this post' };
  }
  return { ok: true, doc };
}

// POST /hidden-tags/:postType/:postId  -> Hide
router.post('/:postType/:postId', verifyToken, async (req, res) => {
  const { postType, postId } = req.params;
  const userId = req.user?.id;

  try {
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }

    const Model = getModelByType(postType); // 'Review' | 'CheckIn'
    if (!Model || !['Review', 'CheckIn'].includes(Model?.modelName)) {
      return res.status(400).json({ message: 'Invalid postType' });
    }

    // only allow hiding if the user is actually tagged in it
    const ok = await ensureUserIsTagged(Model, postId, userId);
    if (!ok.ok) return res.status(ok.code).json({ message: ok.message });

    const userObjId = new mongoose.Types.ObjectId(String(userId));
    const postObjId = new mongoose.Types.ObjectId(String(postId));

    await HiddenTag.updateOne(
      { userId: userObjId, targetRef: Model.modelName, targetId: postObjId },
      { $setOnInsert: { userId: userObjId, targetRef: Model.modelName, targetId: postObjId } },
      {
        upsert: true,
        setDefaultsOnInsert: true,
        timestamps: true, // ensure createdAt is set on upsert with schema timestamps
      }
    );

    return res.status(200).json({ success: true, hidden: true });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

// DELETE /hidden-tags/:postType/:postId  -> Unhide
router.delete('/:postType/:postId', verifyToken, async (req, res) => {
  const { postType, postId } = req.params;
  const userId = req.user?.id;

  try {
    if (!mongoose.isValidObjectId(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }

    const Model = getModelByType(postType);
    if (!Model || !['Review', 'CheckIn'].includes(Model?.modelName)) {
      return res.status(400).json({ message: 'Invalid postType' });
    }

    const userObjId = new mongoose.Types.ObjectId(String(userId));
    const postObjId = new mongoose.Types.ObjectId(String(postId));

    const del = await HiddenTag.findOneAndDelete({
      userId: userObjId,
      targetRef: Model.modelName,
      targetId: postObjId,
    });

    return res.status(200).json({ success: true, hidden: false, removed: !!del });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

// GET /hidden-tags/ids?postType=review|check-in&page=1&limit=50
router.get('/ids', verifyToken, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const typeRef = normalizeTypeRef(req.query.postType); // 'Review' | 'CheckIn' | null

    const match = { userId: new mongoose.Types.ObjectId(String(userId)) };
    if (typeRef) match.targetRef = typeRef;

    const rows = await HiddenTag.find(
      match,
      { targetRef: 1, targetId: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .lean();

    const items = rows.map((r) => ({
      postType: REF_TO_RAW[r.targetRef] || String(r.targetRef || '').toLowerCase(),
      postId: String(r.targetId),
      hiddenId: String(r._id),
      createdAt: r.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

module.exports = router;
