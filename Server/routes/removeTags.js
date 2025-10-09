const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Review = require('../models/Reviews');
const CheckIn = require('../models/CheckIns');
const Event = require('../models/Events');
const Promotion = require('../models/Promotions');
const verifyToken = require('../middleware/verifyToken'); // <-- update path or replace with your own

// Map postType → Model
const MODEL_BY_TYPE = {
    review: Review,
    reviews: Review,
    'check-in': CheckIn,
    'check-ins': CheckIn,
    checkin: CheckIn,
    event: Event,
    events: Event,
    promotion: Promotion,
    promotions: Promotion,
};

function normalizeType(t) {
    return String(t || '').trim().toLowerCase();
}

function getModelOrNull(postType) {
    return MODEL_BY_TYPE[normalizeType(postType)] || null;
}

// ---- helpers ----
function toStr(v) {
    return v != null ? String(v) : '';
}

// Summarize whether user is still tagged post-level / how many photos contain tag
function tagSummary(doc, userId) {
    const uid = toStr(userId);

    const postLevel =
        Array.isArray(doc.taggedUsers) &&
        doc.taggedUsers.some(id => toStr(id) === uid);

    const photoCount = Array.isArray(doc.photos)
        ? doc.photos.reduce((n, p) => {
            const has = Array.isArray(p.taggedUsers) &&
                p.taggedUsers.some(t => toStr(t.userId) === uid);
            return n + (has ? 1 : 0);
        }, 0)
        : 0;

    return { postLevel, photoCount };
}

function removePostLevelTagIfPresent(doc, userId) {
    if (!Array.isArray(doc.taggedUsers)) return false;
    const uid = toStr(userId);
    const before = doc.taggedUsers.length;
    doc.taggedUsers = doc.taggedUsers.filter(id => toStr(id) !== uid);
    return before !== doc.taggedUsers.length;
}

function removeFromAllPhotos(doc, userId) {
    if (!Array.isArray(doc.photos)) return 0;
    const uid = toStr(userId);
    let removed = 0;
    doc.photos.forEach(p => {
        if (!Array.isArray(p.taggedUsers)) return;
        const before = p.taggedUsers.length;
        p.taggedUsers = p.taggedUsers.filter(t => toStr(t.userId) !== uid);
        removed += Math.max(0, before - p.taggedUsers.length);
    });
    return removed;
}

function removeFromOnePhoto(doc, photoId, userId) {
    if (!Array.isArray(doc.photos)) return 0;
    const uid = toStr(userId);
    const pid = toStr(photoId);
    const photo = doc.photos.find(p => toStr(p._id) === pid);
    if (!photo || !Array.isArray(photo.taggedUsers)) return 0;
    const before = photo.taggedUsers.length;
    photo.taggedUsers = photo.taggedUsers.filter(t => toStr(t.userId) !== uid);
    return Math.max(0, before - photo.taggedUsers.length);
}

// Ensure only the authenticated user can self-untag
function ensureSelfUntag(req, res) {
    if (!req.user || !req.user._id) {
        res.status(401).json({ message: 'Unauthorized' });
        return false;
    }
    return true;
}

// =============== ROUTES ===============

/**
 * DELETE /api/self-tags/:postType/:postId
 * Remove the authenticated user from the entire post:
 * - Removes post-level tag (Review/CheckIn) if present
 * - Removes all photo-level tags across photos (all post types)
 */
router.delete('/:postType/:postId', verifyToken, async (req, res) => {
    if (!ensureSelfUntag(req, res)) return;

    const { postType, postId } = req.params;
    const Model = getModelOrNull(postType);
    if (!Model) return res.status(400).json({ message: 'Invalid postType' });

    const userId = req.user.id;

    let doc = await Model.findById(postId);
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    const before = tagSummary(doc, userId);

    // Remove post-level association if the schema has one
    let removedPostLevel = false;
    if (Array.isArray(doc.taggedUsers)) {
        removedPostLevel = removePostLevelTagIfPresent(doc, userId);
    }

    // Remove from all photos
    const removedFromPhotos = removeFromAllPhotos(doc, userId);

    await doc.save();
    const after = tagSummary(doc, userId);

    return res.json({
        ok: true,
        postType: normalizeType(postType),
        postId,
        userId,
        removed: {
            postLevel: removedPostLevel,
            photoTags: removedFromPhotos,
        },
        remaining: after,
        before, // optional, useful for debugging/analytics
    });
});

/**
 * DELETE /api/self-tags/:postType/:postId/photo/:photoId
 * Remove the authenticated user from one specific photo within the post.
 * - Leaves any post-level tag intact
 * - Leaves any tags on other photos intact
 */
router.delete('/:postType/:postId/photo/:photoId', verifyToken, async (req, res) => {
  const { postType, postId, photoId } = req.params || {};
  const userId = req.user?.id;

  try {
    // Auth/ownership check; this should send its own response on failure
    if (!ensureSelfUntag(req, res)) return;

    const Model = getModelOrNull(postType);
    if (!Model) return res.status(400).json({ message: 'Invalid postType' });
    if (!photoId) return res.status(400).json({ message: 'photoId is required' });

    const doc = await Model.findById(postId);
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    const before = tagSummary(doc, userId);

    const removedCount = removeFromOnePhoto(doc, photoId, userId);
    if (removedCount === 0) {
      // No save to avoid bumping updatedAt
      return res.json({
        ok: true,
        postType: normalizeType(postType),
        postId,
        photoId,
        removed: 0,
        remaining: before, // unchanged
        message: 'No matching tag found on the specified photo',
      });
    }

    await doc.save();
    const after = tagSummary(doc, userId);

    return res.json({
      ok: true,
      postType: normalizeType(postType),
      postId,
      photoId,
      removed: removedCount,
      remaining: after,
      userId,
      before, // optional
    });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
