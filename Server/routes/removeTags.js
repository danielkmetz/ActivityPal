const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { Post } = require('../models/Post'); // ✅ unified Post model (with discriminators)
const { removeTagNotifications } = require('../utils/notifications/removeTagNotifications');
const verifyToken = require('../middleware/verifyToken');

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));

/* ----------------------------- type helpers ----------------------------- */

const CANON_TYPES = new Set([
  'review',
  'check-in',
  'invite',
  'event',
  'promotion',
  'sharedPost',
  'liveStream',
]);

function normalizeType(t) {
  const s = String(t || '').trim().toLowerCase();
  if (s === 'review' || s === 'reviews') return 'review';
  if (s === 'check-in' || s === 'checkins' || s === 'checkin') return 'check-in';
  if (s === 'invite' || s === 'invites' || s === 'activityinvite') return 'invite';
  if (s === 'event' || s === 'events') return 'event';
  if (s === 'promotion' || s === 'promotions' || s === 'promo' || s === 'promos') return 'promotion';
  if (s === 'sharedpost' || s === 'sharedposts' || s === 'shared') return 'sharedPost';
  if (s === 'livestream' || s === 'live_stream' || s === 'live') return 'liveStream';
  return null;
}

// If your notifications store still expects legacy model names, map unified -> legacy
const TYPE_TO_LEGACY_REF = {
  review: 'Review',
  'check-in': 'CheckIn',
  invite: 'ActivityInvite',
  event: 'Event',
  promotion: 'Promotion',
  sharedPost: 'SharedPost',
  liveStream: 'LiveStream',
};

/* ------------------------------- utils ---------------------------------- */

function toStr(v) {
  return v != null ? String(v) : '';
}

// Summarize whether user is still tagged post-level / how many media items contain tag
function tagSummary(doc, userId) {
  const uid = toStr(userId);

  const postLevel =
    Array.isArray(doc.taggedUsers) &&
    doc.taggedUsers.some((id) => toStr(id) === uid);

  const photoCount = Array.isArray(doc.media)
    ? doc.media.reduce((n, m) => {
        const has =
          Array.isArray(m.taggedUsers) &&
          m.taggedUsers.some((t) => toStr(t.userId) === uid);
        return n + (has ? 1 : 0);
      }, 0)
    : 0;

  return { postLevel, photoCount };
}

function removePostLevelTagIfPresent(doc, userId) {
  if (!Array.isArray(doc.taggedUsers)) return false;
  const uid = toStr(userId);
  const before = doc.taggedUsers.length;
  doc.taggedUsers = doc.taggedUsers.filter((id) => toStr(id) !== uid);
  return before !== doc.taggedUsers.length;
}

function removeFromAllPhotos(doc, userId) {
  if (!Array.isArray(doc.media)) return 0;
  const uid = toStr(userId);
  let removed = 0;
  doc.media.forEach((m) => {
    if (!Array.isArray(m.taggedUsers)) return;
    const before = m.taggedUsers.length;
    m.taggedUsers = m.taggedUsers.filter((t) => toStr(t.userId) !== uid);
    removed += Math.max(0, before - m.taggedUsers.length);
  });
  return removed;
}

function removeFromOnePhoto(doc, photoId, userId) {
  if (!Array.isArray(doc.media)) return 0;
  const uid = toStr(userId);
  const pid = toStr(photoId);
  const mediaItem = doc.media.find((m) => toStr(m._id) === pid);
  if (!mediaItem || !Array.isArray(mediaItem.taggedUsers)) return 0;
  const before = mediaItem.taggedUsers.length;
  mediaItem.taggedUsers = mediaItem.taggedUsers.filter((t) => toStr(t.userId) !== uid);
  return Math.max(0, before - mediaItem.taggedUsers.length);
}

// Ensure only the authenticated user can self-untag
function ensureSelfUntag(req, res) {
  if (!req.user || !req.user._id) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  return true;
}

/* ============================== ROUTES ================================== */

/**
 * DELETE /api/self-tags/:postType/:postId
 * Remove the authenticated user from the entire post:
 * - Removes post-level tag if present
 * - Removes all media-level tags across all media items
 */
router.delete('/:postType/:postId', verifyToken, async (req, res) => {
  const TAG = '[DELETE /:postType/:postId remove-self-tag]';
  const now = () => new Date().toISOString();

  try {
    if (!ensureSelfUntag(req, res)) return;

    const { postType, postId } = req.params || {};
    const userId = req.user?.id;

    if (!isValidObjectId(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }

    const reqType = normalizeType(postType);
    if (!reqType || !CANON_TYPES.has(reqType)) {
      return res.status(400).json({ message: 'Invalid postType' });
    }

    const doc = await Post.findById(postId);
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    // Optional: guard against mismatched type in URL vs doc
    if (doc.type !== reqType) {
      return res.status(400).json({ message: `Type mismatch: expected ${doc.type}, got ${reqType}` });
    }

    const before = tagSummary(doc, userId);

    let removedPostLevel = false;
    if (Array.isArray(doc.taggedUsers)) {
      removedPostLevel = removePostLevelTagIfPresent(doc, userId);
    }

    const removedFromPhotos = removeFromAllPhotos(doc, userId);

    await doc.save();

    // Remove tag-related notifications (post-level + photo-level) for this post
    const targetRef = TYPE_TO_LEGACY_REF[doc.type] || doc.type;
    const notificationsRemoved = await removeTagNotifications({
      userId,
      targetRef,
      targetId: postId,
      types: ['tag', 'photoTag'],
    });

    const after = tagSummary(doc, userId);

    if (removedPostLevel || removedFromPhotos || notificationsRemoved) {
      console.log(`${TAG} ✅`, {
        at: now(),
        userId,
        postType: doc.type,
        postId,
        removedPostLevel,
        removedFromPhotos,
        notificationsRemoved,
      });
    } else {
      console.log(`${TAG} ℹ️ nothing-to-remove`, {
        at: now(),
        userId,
        postType: doc.type,
        postId,
      });
    }

    return res.json({
      ok: true,
      postType: doc.type,
      postId,
      userId,
      removed: {
        postLevel: removedPostLevel,
        photoTags: removedFromPhotos,
      },
      notificationsRemoved,
      remaining: after,
      before,
    });
  } catch (err) {
    console.error(`${TAG} ❌ 500`, {
      at: new Date().toISOString(),
      params: req.params,
      userId: req?.user?.id,
      error: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * DELETE /api/self-tags/:postType/:postId/photo/:photoId
 * Remove the authenticated user from one specific media item within the post.
 * - Leaves post-level tag intact
 * - Leaves tags on other media items intact
 */
router.delete('/:postType/:postId/photo/:photoId', verifyToken, async (req, res) => {
  const TAG = '[DELETE /:postType/:postId/photo/:photoId remove-self-photo-tag]';

  const { postType, postId, photoId } = req.params || {};
  const userId = req.user?.id;

  try {
    if (!ensureSelfUntag(req, res)) return;

    if (!isValidObjectId(postId)) {
      return res.status(400).json({ message: 'Invalid postId' });
    }
    if (!photoId) return res.status(400).json({ message: 'photoId is required' });

    const reqType = normalizeType(postType);
    if (!reqType || !CANON_TYPES.has(reqType)) {
      return res.status(400).json({ message: 'Invalid postType' });
    }

    const doc = await Post.findById(postId);
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    if (doc.type !== reqType) {
      return res.status(400).json({ message: `Type mismatch: expected ${doc.type}, got ${reqType}` });
    }

    const before = tagSummary(doc, userId);

    const removedCount = removeFromOnePhoto(doc, photoId, userId);
    if (removedCount === 0) {
      return res.json({
        ok: true,
        postType: doc.type,
        postId,
        photoId,
        removed: 0,
        remaining: before,
        message: 'No matching tag found on the specified media item',
      });
    }

    await doc.save();

    // Remove only photoTag notifications for this post
    const targetRef = TYPE_TO_LEGACY_REF[doc.type] || doc.type;
    const notificationsRemoved = await removeTagNotifications({
      userId,
      targetRef,
      targetId: postId,
      types: ['photoTag'],
    });

    const after = tagSummary(doc, userId);

    return res.json({
      ok: true,
      postType: doc.type,
      postId,
      photoId,
      removed: removedCount,
      notificationsRemoved,
      remaining: after,
      userId,
      before,
    });
  } catch (err) {
    console.error(`${TAG} ❌ 500`, {
      err: err?.message,
      stack: err?.stack,
      postType,
      postId,
      photoId,
      userId,
    });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
