const express = require('express');
const mongoose = require('mongoose');
const HiddenTag = require('../models/HiddenTag');
const verifyToken = require('../middleware/verifyToken');
const { getModelByType } = require('../utils/getModelByType');

const router = express.Router();

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
    doc.photos.some((p) =>
      Array.isArray(p?.taggedUsers) && p.taggedUsers.some((t) => String(t?.userId) === uidStr)
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

    // Only allow hiding if the user is actually tagged in it
    const ok = await ensureUserIsTagged(Model, postId, userId);
    if (!ok.ok) return res.status(ok.code).json({ message: ok.message });

    await HiddenTag.updateOne(
      { userId, targetRef: Model.modelName, targetId: postId },
      { $setOnInsert: { userId, targetRef: Model.modelName, targetId: postId } },
      { upsert: true }
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

    const del = await HiddenTag.findOneAndDelete({
      userId,
      targetRef: Model.modelName,
      targetId: postId,
    });

    return res.status(200).json({ success: true, hidden: false, removed: !!del });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

module.exports = router;
