const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const HiddenPost = require('../models/HiddenPosts'); // adjust path if needed
const { normalizeTypeRef } = require('../utils/normalizeTypeRef'); // should map 'invite' -> 'ActivityInvite'
const { normalizePostType } = require('../utils/normalizePostType'); // should accept 'invite'
const { getModelByType } = require('../utils/getModelByType');
const { getPostPayloadById } = require('../utils/normalizePostStructure');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));

// ModelName -> raw key used client-side
const REF_TO_RAW = {
  Review: 'review',
  CheckIn: 'check-in',
  SharedPost: 'sharedPost',
  ActivityInvite: 'invite',      // <-- switched to 'invite'
  Event: 'event',
  Promotion: 'promotion',
};

// Helper to build the response key consistently
const modelNameToRaw = (modelName) =>
  REF_TO_RAW[modelName] || String(modelName || '').toLowerCase();

/**
 * GET /api/hidden
 * Returns enriched hidden posts OR ids depending on ?include=docs|ids
 * Supports optional ?postType=review|check-in|sharedPost|invite|event|promotion
 * Supports pagination (page, limit)
 */
router.get('/', verifyToken, async (req, res) => {
  const TAG = '[GET /hidden]';
  const now = () => new Date().toISOString();

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  // normalizeTypeRef must map 'invite' -> 'ActivityInvite'
  const typeRef = normalizeTypeRef(req.query.postType);
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
          targetRef: r.targetRef,
          targetId: r.targetId,
          createdAt: r.createdAt,
        })),
      });
    }

    const items = await Promise.all(
      rows.map(async (r) => {
        const rawType = REF_TO_RAW[r.targetRef]; // includes 'invite' for ActivityInvite
        let post = null;

        if (!rawType) {
          console.warn(`${TAG} unmapped targetRef`, {
            at: now(),
            userId,
            targetRef: r.targetRef,
            targetId: String(r.targetId),
          });
        } else {
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
        }

        return {
          hiddenId: r._id,
          targetRef: r.targetRef,
          targetId: r.targetId,
          createdAt: r.createdAt,
          post,
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
 */
router.post('/:postType/:postId', verifyToken, async (req, res) => {
  const TAG = '[POST /hidden/:postType/:postId]';
  const userId = req.user?.id;
  const { postType: rawType, postId } = req.params || {};
  const postType = normalizePostType(rawType);

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });

  const Model = getModelByType(postType);
  if (!Model) return res.status(400).json({ message: 'Invalid postType' });

  try {
    const exists = await Model.exists({ _id: postId });
    if (!exists) return res.status(404).json({ message: 'Post not found' });

    await HiddenPost.findOneAndUpdate(
      { userId, targetRef: Model.modelName, targetId: postId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );

    // Build key using our mapping so ActivityInvite -> 'invite'
    const raw = modelNameToRaw(Model.modelName);
    return res.status(200).json({ ok: true, key: `${raw}:${postId}`, hidden: true });
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
  const postType = normalizePostType(rawType);

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });

  const Model = getModelByType(postType);
  if (!Model) return res.status(400).json({ message: 'Invalid postType' });

  try {
    await HiddenPost.deleteOne({ userId, targetRef: Model.modelName, targetId: postId });
    const raw = modelNameToRaw(Model.modelName);
    return res.status(200).json({ ok: true, key: `${raw}:${postId}`, hidden: false });
  } catch (err) {
    console.error(`${TAG} ❌`, { rawType, postId, userId, err: err?.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/hidden/keys
 * List all hidden keys for the current user (for boot-time hydration)
 * Keys will use raw mapping (e.g., ActivityInvite -> 'invite', CheckIn -> 'check-in')
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
      const raw = modelNameToRaw(r.targetRef);
      return `${raw}:${String(r.targetId)}`;
    });

    return res.status(200).json({ ok: true, keys });
  } catch (err) {
    console.error(`${TAG} ❌`, { userId, err: err?.message });
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
