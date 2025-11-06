const router = require('express').Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');

const { Post } = require('../models/Post');  // ✅ unified Post model
const User = require('../models/User');
const Business = require('../models/Business');

/* -------------------------------------------------------------------------- */
/*                               Local utilities                               */
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
const oid   = (v) => new mongoose.Types.ObjectId(String(v));

/* -------------------------------------------------------------------------- */
/*                        Notification helpers (Post)                          */
/* -------------------------------------------------------------------------- */

function findLikeNotifIndex(notifs = [], { likerId, postId, postType }) {
  return notifs.findIndex(
    (n) =>
      n?.type === 'like' &&
      String(n?.relatedId) === String(likerId) &&
      String(n?.targetId) === String(postId) &&
      n?.postType === postType
  );
}

async function addLikeNotification({ post, likerId, likerName }) {
  if (!post?.ownerId) return;
  if (String(post.ownerId) === String(likerId)) return; // don't notify self

  const payload = {
    type: 'like',
    message: `${likerName} liked your ${post.type}`,
    relatedId: likerId,
    typeRef: 'User',
    targetId: post._id,
    targetRef: 'Post',
    commentId: null,
    replyId: null,
    read: false,
    postType: post.type,
    createdAt: new Date(),
  };

  if (post.ownerModel === 'Business') {
    const biz = await Business.findById(post.ownerId);
    if (!biz) return;
    biz.notifications = biz.notifications || [];
    const idx = findLikeNotifIndex(biz.notifications, {
      likerId,
      postId: post._id,
      postType: post.type,
    });
    if (idx === -1) {
      biz.notifications.push(payload);
      await biz.save();
    }
  } else {
    const user = await User.findById(post.ownerId);
    if (!user) return;
    user.notifications = user.notifications || [];
    const idx = findLikeNotifIndex(user.notifications, {
      likerId,
      postId: post._id,
      postType: post.type,
    });
    if (idx === -1) {
      user.notifications.push(payload);
      await user.save();
    }
  }
}

async function removeLikeNotification({ post, likerId }) {
  if (!post?.ownerId) return;

  if (post.ownerModel === 'Business') {
    const biz = await Business.findById(post.ownerId);
    if (!biz) return;
    const idx = findLikeNotifIndex(biz.notifications || [], {
      likerId,
      postId: post._id,
      postType: post.type,
    });
    if (idx !== -1) {
      biz.notifications.splice(idx, 1);
      await biz.save();
    }
  } else {
    const user = await User.findById(post.ownerId);
    if (!user) return;
    const idx = findLikeNotifIndex(user.notifications || [], {
      likerId,
      postId: post._id,
      postType: post.type,
    });
    if (idx !== -1) {
      user.notifications.splice(idx, 1);
      await user.save();
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Routes                                   */
/* -------------------------------------------------------------------------- */

/**
 * Toggle like on a unified Post
 * POST /likes/:postId/like
 */
router.post('/:postId/like', verifyToken, async (req, res) => {
  const rid = genRid('tgl');
  const { log, warn, err } = mkLoggers(rid);
  res.set('X-Request-Id', rid);

  try {
    const { postId } = req.params;
    if (!isOid(postId)) return res.status(400).json({ message: 'Invalid postId', rid });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized', rid });

    const likerName =
      (typeof req.user?.fullName === 'string' && req.user.fullName.trim()) ||
      [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') ||
      'Unknown';

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found', rid });

    post.likes = Array.isArray(post.likes) ? post.likes : [];

    const idx = post.likes.findIndex((l) => String(l.userId) === String(userId));
    const isUnliking = idx > -1;

    if (isUnliking) {
      post.likes.splice(idx, 1);
    } else {
      post.likes.push({ userId, fullName: likerName, date: new Date() });
    }

    await post.save();

    // Notifications (best-effort)
    try {
      if (isUnliking) {
        await removeLikeNotification({ post, likerId: userId });
      } else {
        await addLikeNotification({ post, likerId: userId, likerName });
      }
    } catch (e) {
      warn('notification step failed (continuing)', { err: e?.message });
    }

    return res.json({
      ok: true,
      message: isUnliking ? 'Like removed' : 'Like added',
      postId: String(post._id),
      liked: !isUnliking,
      likes: post.likes,
      likesCount: post.likes.length,
      rid,
    });
  } catch (e) {
    err('toggleLike error', { msg: e?.message, stack: e?.stack, params: req.params });
    return res.status(500).json({ message: 'Internal Server Error', rid });
  }
});

/**
 * Convenience alias for historical clients:
 * POST /likes/live/:id/like   →  /likes/:postId/like
 * (This assumes you now create a Post for live streams and pass that Post id.)
 */
router.post('/live/:id/like', verifyToken, async (req, res, next) => {
  req.params.postId = req.params.id;
  delete req.params.id;
  next();
}, router); // delegate to the handler above

module.exports = router;
