const router = require('express').Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const deleteS3Objects = require('../utils/deleteS3Objects');

const Promotion = require('../models/Promotions.js');
const Event = require('../models/Events.js');           // <- adjust path/model name
const LiveStream = require('../models/LiveStream.js');
const Review = require('../models/Reviews.js');
const CheckIn = require('../models/CheckIns.js');
const ActivityInvite = require('../models/ActivityInvites.js');
const SharedPost = require('../models/SharedPost.js');
const User = require('../models/User.js');
const Business = require('../models/Business.js');     // optional (for business-owned posts)

/* ----------------------- model + ownership maps ----------------------- */
// Map postType URL segment -> Mongoose model
const MODEL_BY_TYPE = {
    promotions: Promotion,
    promos: Promotion,
    events: Event,
    liveStreams: LiveStream,
    reviews: Review,
    checkins: CheckIn,         // if your path uses "check-ins", use "checkins" in URL
    'check-ins': CheckIn,
    checkIns: CheckIn,
    checkIn: CheckIn,
    'check-in': CheckIn,
    invites: ActivityInvite,
    invite: ActivityInvite,
    sharedPosts: SharedPost,
};

const ownerResolvers = {
    promotions: async (doc) => {
        if (!doc?.placeId) return { ownerId: null, ownerRef: 'Business' };
        const biz = await Business.findOne({ placeId: doc.placeId }).select('_id').lean();
        return { ownerId: biz?._id || null, ownerRef: 'Business' };
    },

    // ⬇️ change events to look up Business by placeId
    events: async (doc) => {
        if (!doc?.placeId) return { ownerId: null, ownerRef: 'Business' };
        const biz = await Business.findOne({ placeId: doc.placeId }).select('_id').lean();
        return { ownerId: biz?._id || null, ownerRef: 'Business' };
    },

    liveStreams: async (doc) => ({ ownerId: String(doc?.hostUserId || ''), ownerRef: 'User' }),
    reviews: async (doc) => ({ ownerId: String(doc?.userId || ''), ownerRef: 'User' }),
    checkins: async (doc) => ({ ownerId: String(doc?.userId || ''), ownerRef: 'User' }),
    invites: async (doc) => ({ ownerId: String(doc?.senderId || ''), ownerRef: 'User' }),
    sharedPosts: async (doc) => ({ ownerId: String(doc?.user || ''), ownerRef: 'User' }),
};

// Helper: build safe media payload
function parseMedia(media) {
    return (media?.photoKey && media?.mediaType)
        ? {
            photoKey: media.photoKey,
            mediaType: ['image', 'video'].includes(media.mediaType) ? media.mediaType : null,
        }
        : { photoKey: null, mediaType: null };
}

function collectMediaKeysDeep(node) {
    const keys = [];
    const stack = [node];
    while (stack.length) {
        const n = stack.pop();
        if (n?.media?.photoKey) keys.push(n.media.photoKey);
        if (Array.isArray(n?.replies) && n.replies.length) stack.push(...n.replies);
    }
    return keys;
}

// Helpers: deep operations on nested replies
function findReplyDeep(replies = [], targetId, topLevelId = null) {
    for (let i = 0; i < replies.length; i++) {
        const r = replies[i];
        if (String(r?._id) === String(targetId)) {
            return {
                node: r,
                parentArr: replies,
                index: i,
                topLevelId,
                parentAuthorId: r.userId,
                isTopLevel: false,
            };
        }
        if (Array.isArray(r?.replies) && r.replies.length) {
            const found = findReplyDeep(r.replies, targetId, topLevelId);
            if (found) return found;
        }
    }
    return null;
}

function editCommentDeep(list = [], targetId, updater) {
    for (const c of list) {
        if (String(c._id) === String(targetId)) {
            const { oldPhotoKey } = updater(c) || {};
            return { updated: true, oldPhotoKey: oldPhotoKey || null };
        }
        if (c.replies?.length) {
            const res = editCommentDeep(c.replies, targetId, updater);
            if (res?.updated) return res;
        }
    }
    return { updated: false, oldPhotoKey: null };
}

function deleteCommentDeep(list = [], targetId) {
    let deleted = false;            // <-- accumulate from nested calls too
    const mediaKeys = [];
    const next = [];

    for (const c of list) {
        if (String(c?._id) === String(targetId)) {
            deleted = true;
            mediaKeys.push(...collectMediaKeysDeep(c));
            // drop this node (don't push to `next`)
            continue;
        }

        // Recurse into children
        if (Array.isArray(c?.replies) && c.replies.length) {
            const res = deleteCommentDeep(c.replies, targetId);
            if (res.deleted) deleted = true;              // <-- bubble up
            if (res.mediaKeys.length) mediaKeys.push(...res.mediaKeys);
            c.replies = res.list;                         // mutate in place is fine
        }

        next.push(c);
    }

    return { deleted, mediaKeys, list: next };
}

// Basic notifier that supports User or Business “owners”.
async function notifyOwner({ ownerRef, ownerId, type, message, relatedUserId, commentIds, postType, targetId }) {
    if (!ownerId) return;
    try {
        if (ownerRef === 'Business') {
            const biz = await Business.findById(ownerId);
            if (!biz) return;
            biz.notifications = biz.notifications || [];
            biz.notifications.push({
                type, message,
                relatedId: relatedUserId,
                typeRef: 'User',
                targetId, targetRef: null,
                commentId: commentIds?.commentId || null,
                replyId: commentIds?.replyId || null,
                read: false,
                postType,
                createdAt: new Date(),
            });
            await biz.save();
        } else {
            const user = await User.findById(ownerId);
            if (!user) return;
            user.notifications = user.notifications || [];
            user.notifications.push({
                type, message,
                relatedId: relatedUserId,
                typeRef: 'User',
                targetId, targetRef: null,
                commentId: commentIds?.commentId || null,
                replyId: commentIds?.replyId || null,
                read: false,
                postType,
                createdAt: new Date(),
            });
            await user.save();
        }
    } catch { }
}

/* ----------------------------- Middleware ----------------------------- */

async function loadDoc(req, res, next) {
    const { postType, postId } = req.params;
    const Model = MODEL_BY_TYPE[postType];
    if (!Model) return res.status(400).json({ message: `Unsupported postType: ${postType}` });

    const doc = await Model.findById(postId);
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    req._model = Model;
    req._doc = doc;
    req._postType = postType;
    req._ownerResolver = ownerResolvers[postType] || (async () => ({ ownerId: null, ownerRef: 'User' }));
    next();
}

// ---- logging helpers (local) ----
const short = (v, n = 8) => (typeof v === 'string' ? v.slice(-n) : v);
const nowIso = () => new Date().toISOString();
const genRid = (prefix = 'cmt') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
    const base = `[comments:${rid}]`;
    return {
        log: (msg, extra) => console.log(base, msg, extra !== undefined ? redact(extra) : ''),
        warn: (msg, extra) => console.warn(base, msg, extra !== undefined ? redact(extra) : ''),
        err: (msg, extra) => console.error(base, msg, extra !== undefined ? redact(extra) : ''),
    };
};

const timeAsync = async (label, fn, { log, warn } = {}) => {
    const t0 = Date.now();
    try {
        const out = await fn();
        log && log(`${label} ok`, { ms: Date.now() - t0 });
        return out;
    } catch (e) {
        (warn || console.warn)(`${label} err`, { ms: Date.now() - t0, err: e?.message });
        throw e;
    }
};

/* ------------------------------- Routes ------------------------------- */

// Add comment (fullName comes from verifyToken)
router.post('/:postType/:postId/comments', verifyToken, loadDoc, async (req, res) => {
    const rid = genRid('addCmt');
    const { log, warn, err } = mkLoggers(rid);
    res.set('X-Request-Id', rid);

    log('REQUEST', {
        at: nowIso(),
        params: req.params,
        userId: req.user?.id || null,
        bodyKeys: Object.keys(req.body || {}),
        hasMedia: !!req.body?.media,
        commentTextLen: (req.body?.commentText || '').length,
    });

    try {
        const doc = req._doc;
        const postType = req._postType;              // 'reviews' | 'promotions' | 'events' | ...
        const ownerResolver = req._ownerResolver;

        const { id: userId, fullName: tokenFullName } = req.user || {};
        if (!userId) {
            log('AUTH FAIL', { reason: 'missing user id' });
            return res.status(401).json({ message: 'Unauthorized', rid });
        }
        if (!doc) {
            log('DOC NOT FOUND', { postType, params: req.params });
            return res.status(404).json({ message: 'Not found', rid });
        }

        // Resolve media (best-effort parse)
        let mediaPayload;
        try {
            mediaPayload = parseMedia(req.body?.media);
            log('parseMedia ok', { hasKey: !!mediaPayload?.photoKey, mediaType: mediaPayload?.mediaType || null });
        } catch (e) {
            warn('parseMedia err', { err: e?.message });
            mediaPayload = { photoKey: null, mediaType: null };
        }

        // Full name strictly from verifyToken (trim + safe fallback)
        const safeFullName = (typeof tokenFullName === 'string' ? tokenFullName : '').trim() || 'Unknown';
        if (safeFullName === 'Unknown') {
            warn('fullName missing from verifyToken; using fallback', { userId });
        }

        const commentId = new mongoose.Types.ObjectId();
        const comment = {
            _id: commentId,
            userId,
            fullName: safeFullName,
            commentText: String(req.body?.commentText || ''),
            date: new Date(),
            likes: [],
            replies: [],
            media: mediaPayload,
        };

        // Persist
        const beforeLen = Array.isArray(doc.comments) ? doc.comments.length : 0;
        if (!Array.isArray(doc.comments)) doc.comments = [];
        doc.comments.push(comment);

        await timeAsync('mongo:saveDoc', () => doc.save(), { log, warn });

        const afterLen = doc.comments.length;
        log('SAVE OK', {
            postId: String(doc._id),
            postType,
            commentsBefore: beforeLen,
            commentsAfter: afterLen,
            newCommentId: String(commentId),
            hasMediaKey: !!mediaPayload?.photoKey,
        });

        // Notify owner (best-effort)
        if (typeof ownerResolver === 'function') {
            try {
                const { ownerId, ownerRef } = await timeAsync('resolveOwner', () => ownerResolver(doc), { log, warn });
                log('OWNER RESOLVED', { ownerRef, ownerId: ownerId ? String(ownerId) : null });

                if (ownerId && String(ownerId) !== String(userId)) {
                    await timeAsync(
                        'notifyOwner',
                        () =>
                            notifyOwner({
                                ownerRef,
                                ownerId,
                                type: 'comment',
                                message: `${safeFullName} commented on your ${String(postType || '').slice(0, -1)}`,
                                relatedUserId: userId,
                                commentIds: { commentId },
                                postType,
                                targetId: doc._id,
                            }),
                        { log, warn }
                    );
                    log('NOTIFY OK', { ownerId: String(ownerId) });
                } else {
                    log('NOTIFY SKIP', { reason: 'self or missing ownerId' });
                }
            } catch (e) {
                warn('NOTIFY FAIL (continuing)', { err: e?.message });
            }
        } else {
            warn('ownerResolver missing on req; skipping notify');
        }

        // Presign media URL (best-effort)
        let presignedUrl = null;
        if (mediaPayload?.photoKey) {
            try {
                presignedUrl = await timeAsync('s3:getPresignedUrl', () => getPresignedUrl(mediaPayload.photoKey), { log, warn });
            } catch (e) {
                warn('presign err (continuing)', { key: mediaPayload.photoKey, err: e?.message });
            }
        }

        const responseComment = mediaPayload?.photoKey
            ? { ...comment, media: { ...mediaPayload, mediaUrl: presignedUrl } }
            : comment;

        log('RESPONSE', {
            status: 201,
            rid,
            commentId: String(commentId),
            hasMediaKey: !!mediaPayload?.photoKey,
            mediaUrlOk: !!presignedUrl,
        });

        return res.status(201).json({
            message: 'Comment added',
            comment: responseComment,
            rid,
        });
    } catch (e) {
        err('ERROR addComment', {
            at: nowIso(),
            rid,
            msg: e?.message,
            name: e?.name,
            code: e?.code,
            stack: e?.stack,
            params: req.params,
        });
        return res.status(500).json({ message: 'Internal Server Error', rid });
    }
});

// Add nested reply
router.post('/:postType/:postId/comments/:commentId/replies', verifyToken, loadDoc, async (req, res) => {
    const { _doc: doc, params: { commentId }, _postType: postType } = req;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const fullName = req.user?.fullName || [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') || null;
    const mediaPayload = parseMedia(req.body?.media);

    try {
        const reply = {
            _id: new mongoose.Types.ObjectId(),
            userId,
            fullName,
            commentText: req.body?.commentText || '',
            date: new Date(),
            likes: [],
            replies: [],
            media: mediaPayload,
        };

        let inserted = false;
        let parentAuthorId = null;
        let topLevelId = null;

        const top = doc.comments.id(commentId);
        if (top) {
            parentAuthorId = top.userId;
            topLevelId = top._id;
            top.replies = top.replies || [];
            top.replies.push(reply);
            inserted = true;
        } else {
            for (const c of (doc.comments || [])) {
                const found = findReplyDeep(c.replies || [], commentId, c._id);
                if (found?.node) {
                    found.node.replies = found.node.replies || [];
                    found.node.replies.push(reply);
                    parentAuthorId = found.parentAuthorId;
                    topLevelId = found.topLevelId || c._id;
                    inserted = true;
                    break;
                }
            }
        }

        if (!inserted) return res.status(404).json({ message: 'Parent comment/reply not found' });

        await doc.save();

        // Notify parent author (skip self)
        if (parentAuthorId && String(parentAuthorId) !== String(userId)) {
            const targetUser = await User.findById(parentAuthorId);
            if (targetUser) {
                targetUser.notifications = targetUser.notifications || [];
                targetUser.notifications.push({
                    type: 'reply',
                    message: `${fullName || 'Someone'} replied to your comment`,
                    relatedId: userId,
                    typeRef: 'User',
                    targetId: doc._id,
                    targetRef: null,
                    commentId: topLevelId,
                    replyId: reply._id,
                    read: false,
                    postType,
                    createdAt: new Date(),
                });
                await targetUser.save();
            }
        }

        const presignedUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;
        return res.status(201).json({
            message: 'Reply added',
            reply: mediaPayload.photoKey ? { ...reply, media: { ...mediaPayload, mediaUrl: presignedUrl } } : reply,
        });
    } catch {
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Like/unlike comment or reply
router.put('/:postType/:postId/comments/:commentId/like', verifyToken, loadDoc, async (req, res) => {
  const { _doc: doc, params: { commentId }, _postType: postType } = req;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const fullName =
    req.user?.fullName ||
    [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') ||
    null;

  try {
    let target = null;
    let parentAuthorId = null;
    let topLevelId = null;

    // Top-level first
    const top = doc.comments.id(commentId);
    if (top) {
      target = top;
      parentAuthorId = top.userId;
      topLevelId = top._id;
    } else {
      // Deep search
      for (const c of (doc.comments || [])) {
        const found = findReplyDeep(c.replies || [], commentId, c._id); // carries top id
        if (found?.node) {
          target = found.node;
          parentAuthorId = found.parentAuthorId;
          topLevelId = found.topLevelId || c._id;
          break;
        }
      }
    }

    if (!target) return res.status(404).json({ message: 'Comment/reply not found' });

    target.likes = target.likes || [];
    const idx = target.likes.findIndex(l => String(l.userId) === String(userId));
    const isUnliking = idx > -1;

    if (isUnliking) target.likes.splice(idx, 1);
    else target.likes.push({ userId, fullName, date: new Date() });

    // Deep mutation safety
    doc.markModified?.('comments');
    await doc.save();

    // Optional notifications...
    if (parentAuthorId && String(parentAuthorId) !== String(userId)) {
      const targetUser = await User.findById(parentAuthorId);
      if (targetUser) {
        const existsIdx =
          targetUser.notifications?.findIndex(n =>
            n.type === 'like' &&
            String(n.relatedId) === String(userId) &&
            n.typeRef === 'User' &&
            String(n.targetId) === String(doc._id) &&
            String(n.commentId) === String(topLevelId || commentId) &&
            String(n.replyId || commentId) === String(commentId) &&
            n.postType === postType
          ) ?? -1;

        if (!isUnliking && existsIdx === -1) {
          targetUser.notifications = targetUser.notifications || [];
          targetUser.notifications.push({
            type: 'like',
            message: `${fullName || 'Someone'} liked your comment`,
            relatedId: userId,
            typeRef: 'User',
            targetId: doc._id,
            targetRef: null,
            commentId: topLevelId || commentId, // <- top-level thread id
            replyId: commentId,                  // <- the exact node
            read: false,
            postType,
            createdAt: new Date(),
          });
          await targetUser.save();
        } else if (isUnliking && existsIdx !== -1) {
          targetUser.notifications.splice(existsIdx, 1);
          await targetUser.save();
        }
      }
    }

    // 🔑 Return both ids so the client can update the right node quickly
    return res.json({
      ok: true,
      message: 'Like toggled',
      postType,
      postId: String(doc._id),
      commentId: String(commentId),                    // the node that was liked/unliked
      topLevelCommentId: String(topLevelId || commentId), // the thread root
      likes: target.likes,
    });
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Edit comment or reply (author-only)
router.patch('/:postType/:postId/comments/:commentId', verifyToken, loadDoc, async (req, res) => {
    const { _doc: doc, params: { commentId } } = req;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const mediaPayload = parseMedia(req.body?.media);
    const newText = req.body?.newText;

    try {
        let updatedComment = null;
        let oldPhotoKeyToDelete = null;

        const updater = (c) => {
            if (String(c.userId) !== String(userId)) return {}; // author-only
            const oldKey = c.media?.photoKey || null;
            const newKey = mediaPayload.photoKey || null;
            if (oldKey && oldKey !== newKey) oldPhotoKeyToDelete = oldKey;

            if (typeof newText === 'string') c.commentText = newText;
            c.media = mediaPayload;
            c.updatedAt = new Date();

            updatedComment = {
                _id: c._id,
                userId: c.userId,
                fullName: c.fullName,
                commentText: c.commentText,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                likes: c.likes || [],
                replies: c.replies || [],
                media: c.media,
            };
            return { oldPhotoKey: oldKey && oldKey !== newKey ? oldKey : null };
        };

        const top = doc.comments.id(commentId);
        let edited = false;
        if (top) {
            const { oldPhotoKey } = updater(top) || {};
            if (oldPhotoKey) oldPhotoKeyToDelete = oldPhotoKey;
            edited = true;
        } else {
            const resDeep = editCommentDeep(doc.comments || [], commentId, updater);
            edited = resDeep.updated;
            oldPhotoKeyToDelete = resDeep.oldPhotoKey || oldPhotoKeyToDelete;
        }

        if (!edited) return res.status(404).json({ message: 'Comment/reply not found (or not owner)' });

        await doc.save();
        if (oldPhotoKeyToDelete) await deleteS3Objects([oldPhotoKeyToDelete]);

        const presignedUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;

        return res.json({
            message: 'Comment updated',
            updatedComment: mediaPayload.photoKey
                ? { ...updatedComment, media: { ...mediaPayload, mediaUrl: presignedUrl } }
                : updatedComment,
        });
    } catch {
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Delete comment or reply (author OR post owner)
router.delete('/:postType/:postId/comments/:commentId', verifyToken, loadDoc, async (req, res) => {
    const { _doc: doc, _postType: postType, _ownerResolver, params: { commentId } } = req;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
        // Resolve post owner (for moderator delete)
        const { ownerId } = await _ownerResolver(doc);
        const isOwner = ownerId && String(ownerId) === String(userId);

        const direct = doc.comments.id(commentId);
        if (direct) {
            if (!isOwner && String(direct.userId) !== String(userId)) {
                return res.status(403).json({ message: 'Forbidden' });
            }
            const toDelete = [];
            if (direct.media?.photoKey) toDelete.push(direct.media.photoKey);
            const stack = [...(direct.replies || [])];
            while (stack.length) {
                const n = stack.pop();
                if (n.media?.photoKey) toDelete.push(n.media.photoKey);
                if (n.replies?.length) stack.push(...n.replies);
            }
            direct.deleteOne();
            await doc.save();
            if (toDelete.length) await deleteS3Objects(toDelete);
            return res.json({ message: 'Comment deleted' });
        }

        // Deep delete (ownership best-effort; if you want strict auth here, locate the node first)
        const resDeep = deleteCommentDeep(doc.comments || [], commentId);
        if (!resDeep.deleted) return res.status(404).json({ message: 'Comment/reply not found' });

        // If not post owner, we should ensure the requester authored the node.
        // (Optional strict mode: walk the tree to confirm authorship before allowing.)
        if (!isOwner) {
            // Soft safeguard: deny if not owner; to support strict auth, implement a locateById() first
            return res.status(403).json({ message: 'Forbidden (owner or author required for deep delete)' });
        }

        doc.comments = resDeep.list;
        await doc.save();
        if (resDeep.mediaKeys.length) await deleteS3Objects(resDeep.mediaKeys);

        return res.json({ message: 'Comment deleted' });
    } catch {
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

module.exports = router;
