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
    sharedPosts: async (doc) => ({ ownerId: String(doc?.user?.id || ''), ownerRef: 'User' }),
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

function locateNestedNodeById(comments = [], targetId) {
    for (const c of comments) {
        const found = findReplyDeep(c.replies || [], targetId, c._id); // uses your existing helper
        if (found?.node) return found; // { node, parentArr, index, topLevelId, parentAuthorId }
    }
    return null;
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

function collectNodeIdsDeep(node) {
  const ids = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (n?._id) ids.push(String(n._id));
    if (Array.isArray(n?.replies) && n.replies.length) stack.push(...n.replies);
  }
  return ids;
}

async function removeNotificationsForDeletedNodes({ postType, postId, topLevelCommentId = null, nodeIds = [] }) {
  try {
    const postObjectId = new mongoose.Types.ObjectId(String(postId));
    const idObjs = nodeIds
      .map(id => {
        try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; }
      })
      .filter(Boolean);

    if (idObjs.length) {
      // Remove "like" and "reply" notifications tied to any deleted node (comment or reply)
      await User.updateMany(
        {},
        {
          $pull: {
            notifications: {
              postType,
              targetId: postObjectId,
              $or: [
                { type: 'like',  replyId: { $in: idObjs } },
                { type: 'reply', replyId: { $in: idObjs } },
              ],
            },
          },
        }
      );
    }

    // If a TOP-LEVEL comment was deleted, also remove the original "comment" notification
    if (topLevelCommentId) {
      const topId = new mongoose.Types.ObjectId(String(topLevelCommentId));

      // From Users (owner might be a user)
      await User.updateMany(
        {},
        {
          $pull: {
            notifications: {
              type: 'comment',
              postType,
              targetId: postObjectId,
              commentId: topId,
            },
          },
        }
      );

      // From Businesses (owner might be a business)
      await Business.updateMany(
        {},
        {
          $pull: {
            notifications: {
              type: 'comment',
              postType,
              targetId: postObjectId,
              commentId: topId,
            },
          },
        }
      );
    }
  } catch (e) {
    console.warn('[removeNotificationsForDeletedNodes] failed:', e?.message);
  }
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
    const TAG = '[likeComment]';
    const now = () => new Date().toISOString();

    const { _doc: doc, params: { commentId }, _postType: postType } = req;
    const userId = req.user?.id;

    console.log(`${TAG} ▶ start`, {
        at: now(),
        postType,
        postId: doc?._id?.toString?.() || String(doc?._id || ''),
        commentId: String(commentId),
        userId: String(userId || ''),
    });

    if (!userId) {
        console.warn(`${TAG} ⚠ unauthorized`, { at: now() });
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const fullName =
        req.user?.fullName ||
        [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') ||
        null;

    try {
        if (!doc) {
            console.error(`${TAG} ❌ no doc loaded by loadDoc`, { at: now() });
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        if (!Array.isArray(doc.comments)) {
            console.error(`${TAG} ❌ doc.comments not an array`, {
                at: now(),
                type: typeof doc.comments,
            });
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        let target = null;
        let parentAuthorId = null;
        let topLevelId = null;

        // Top-level first
        const top = doc.comments.id?.(commentId);
        if (top) {
            target = top;
            parentAuthorId = top.userId;
            topLevelId = top._id;
            console.log(`${TAG} ✅ found top-level comment`, {
                at: now(),
                topLevelId: String(topLevelId),
                authorId: String(parentAuthorId || ''),
            });
        } else {
            // Deep search
            if (typeof findReplyDeep !== 'function') {
                console.error(`${TAG} ❌ findReplyDeep is not a function`, { at: now() });
            } else {
                for (const c of (doc.comments || [])) {
                    const found = findReplyDeep(c.replies || [], commentId, c._id); // carries top id
                    if (found?.node) {
                        target = found.node;
                        parentAuthorId = found.parentAuthorId;
                        topLevelId = found.topLevelId || c._id;
                        console.log(`${TAG} ✅ found nested reply`, {
                            at: now(),
                            topLevelId: String(topLevelId),
                            parentAuthorId: String(parentAuthorId || ''),
                        });
                        break;
                    }
                }
            }
        }

        if (!target) {
            console.warn(`${TAG} ⚠ comment/reply not found`, { at: now(), commentId: String(commentId) });
            return res.status(404).json({ message: 'Comment/reply not found' });
        }

        // Toggle like
        target.likes = Array.isArray(target.likes) ? target.likes : [];
        const beforeCount = target.likes.length;
        const idx = target.likes.findIndex(l => String(l.userId) === String(userId));
        const isUnliking = idx > -1;

        if (isUnliking) {
            target.likes.splice(idx, 1);
        } else {
            target.likes.push({ userId, fullName, date: new Date() });
        }

        console.log(`${TAG} 🫶 like toggled`, {
            at: now(),
            action: isUnliking ? 'unlike' : 'like',
            beforeCount,
            afterCount: target.likes.length,
            nodeId: String(commentId),
            topLevelId: String(topLevelId || commentId),
        });

        // Deep mutation safety for Mongoose
        try {
            doc.markModified?.('comments');
            console.log(`${TAG} 💾 saving doc`, { at: now(), modified: doc.isModified?.('comments') });
            await doc.save();
            console.log(`${TAG} ✅ saved doc`, { at: now() });
        } catch (saveErr) {
            console.error(`${TAG} ❌ save failed`, {
                at: now(),
                name: saveErr?.name,
                message: saveErr?.message,
                stack: saveErr?.stack,
                modifiedPaths: doc.modifiedPaths?.(),
            });
            throw saveErr; // bubble to outer catch → 500
        }

        // Notifications (best-effort; still bubble errors to preserve existing behavior)
        if (parentAuthorId && String(parentAuthorId) !== String(userId)) {
            try {
                const targetUser = await User.findById(parentAuthorId);
                if (!targetUser) {
                    console.warn(`${TAG} ⚠ parent author not found for notification`, {
                        at: now(),
                        parentAuthorId: String(parentAuthorId),
                    });
                } else {
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
                            commentId: topLevelId || commentId, // thread root
                            replyId: commentId,                  // exact node
                            read: false,
                            postType,
                            createdAt: new Date(),
                        });
                        await targetUser.save();
                        console.log(`${TAG} 📣 notification created`, {
                            at: now(),
                            forUser: String(parentAuthorId),
                            postType,
                            topLevelId: String(topLevelId || commentId),
                            nodeId: String(commentId),
                        });
                    } else if (isUnliking && existsIdx !== -1) {
                        targetUser.notifications.splice(existsIdx, 1);
                        await targetUser.save();
                        console.log(`${TAG} 🧹 notification removed (unlike)`, {
                            at: now(),
                            forUser: String(parentAuthorId),
                            index: existsIdx,
                        });
                    } else {
                        console.log(`${TAG} 🔎 notification unchanged`, {
                            at: now(),
                            isUnliking,
                            existsIdx,
                        });
                    }
                }
            } catch (notifErr) {
                console.error(`${TAG} ❌ notification phase failed`, {
                    at: now(),
                    name: notifErr?.name,
                    message: notifErr?.message,
                    stack: notifErr?.stack,
                });
                throw notifErr; // keep behavior consistent with your original try/catch
            }
        } else {
            console.log(`${TAG} ↪ skipping notification (self-like or no parentAuthorId)`, {
                at: now(),
                parentAuthorId: String(parentAuthorId || ''),
            });
        }

        console.log(`${TAG} ▶ done`, { at: now() });

        return res.json({
            ok: true,
            message: 'Like toggled',
            postType,
            postId: String(doc._id),
            commentId: String(commentId),
            topLevelCommentId: String(topLevelId || commentId),
            likes: target.likes,
        });
    } catch (err) {
        console.error(`${TAG} ❌ unhandled error`, {
            at: now(),
            name: err?.name,
            message: err?.message,
            stack: err?.stack,
            postType,
            postId: doc?._id?.toString?.() || String(doc?._id || ''),
            commentId: String(commentId),
            userId: String(userId || ''),
        });
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Edit comment or reply (author-only)
router.patch('/:postType/:postId/comments/:commentId', verifyToken, loadDoc, async (req, res) => {
  const TAG = '[PATCH /:postType/:postId/comments/:commentId]';
  const now = () => new Date().toISOString();

  const { _doc: doc, _postType: postType, _ownerResolver, params: { postId, commentId } } = req;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const mediaPayload = parseMedia(req.body?.media);
  const newText = req.body?.newText;

  try {
    // Resolve post owner (moderator edit)
    const { ownerId } = await _ownerResolver(doc);
    const isOwner = ownerId && String(ownerId) === String(userId);

    if (!Array.isArray(doc?.comments)) {
      return res.status(404).json({ message: 'No comments on this post' });
    }

    let target = null;
    let isAuthor = false;
    let isTopLevel = false;

    // 1) Try top-level first
    const top = doc.comments.id?.(commentId);
    if (top) {
      target = top;
      isTopLevel = true;
      isAuthor = String(top.userId) === String(userId);
    } else {
      // 2) Locate nested reply
      const located = locateNestedNodeById(doc.comments || [], commentId);
      if (located?.node) {
        target = located.node;
        isTopLevel = false;
        isAuthor = String(located.node.userId) === String(userId);
      }
    }

    if (!target) {
      return res.status(404).json({ message: 'Comment/reply not found' });
    }

    // Auth: allow post owner or node author
    if (!isOwner && !isAuthor) {
      return res.status(403).json({ message: 'Forbidden (owner or author required to edit)' });
    }

    // Prepare media swap + text update
    const oldKey = target?.media?.photoKey || null;
    const newKey = mediaPayload.photoKey || null;
    const deleteOldAfterSave = oldKey && oldKey !== newKey ? [oldKey] : [];

    if (typeof newText === 'string') target.commentText = newText;
    target.media = mediaPayload;
    target.updatedAt = new Date();

    // Ensure Mongoose registers deep changes
    doc.markModified?.('comments');

    await doc.save();

    if (deleteOldAfterSave.length) {
      try { await deleteS3Objects(deleteOldAfterSave); } catch (e) { /* best-effort */ }
    }

    const presignedUrl = mediaPayload.photoKey
      ? await getPresignedUrl(mediaPayload.photoKey)
      : null;

    // Build response shape
    const updatedComment = {
      _id: target._id,
      userId: target.userId,
      fullName: target.fullName,
      commentText: target.commentText,
      date: target.date,                // keep your original field
      updatedAt: target.updatedAt,
      likes: Array.isArray(target.likes) ? target.likes : [],
      replies: Array.isArray(target.replies) ? target.replies : [],
      media: mediaPayload.photoKey
        ? { ...mediaPayload, mediaUrl: presignedUrl }
        : mediaPayload,
    };

    return res.json({
      message: 'Comment updated',
      updatedComment,
      postType,
      postId: String(doc._id),
      commentId: String(commentId),
      isTopLevel,
    });
  } catch (e) {
    console.error(`${TAG} ❌ 500`, {
      at: now(),
      postType,
      postId,
      commentId,
      userId,
      message: e?.message,
      stack: e?.stack,
    });
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Delete comment or reply (author OR post owner)
router.delete('/:postType/:postId/comments/:commentId', verifyToken, loadDoc, async (req, res) => {
  const { _doc: doc, _postType: postType, _ownerResolver, params: { commentId } } = req;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const { ownerId } = await _ownerResolver(doc);
    const isOwner = ownerId && String(ownerId) === String(userId);

    if (!Array.isArray(doc?.comments)) {
      return res.status(404).json({ message: 'No comments on this post' });
    }

    // Try direct (top-level) comment
    const direct = doc.comments.id?.(commentId);
    if (direct) {
      if (!isOwner && String(direct.userId) !== String(userId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      // Collect node IDs and media BEFORE deleting
      const deletedNodeIds = collectNodeIdsDeep(direct);
      const keys = collectMediaKeysDeep(direct) || [];

      direct.deleteOne();
      doc.markModified?.('comments');
      await doc.save();

      if (keys.length) { try { await deleteS3Objects(keys); } catch {} }

      // Pull notifications related to this deleted TOP-LEVEL thread (likes/replies AND the original comment notice)
      await removeNotificationsForDeletedNodes({
        postType,
        postId: doc._id,
        topLevelCommentId: direct._id,       // top-level comment
        nodeIds: deletedNodeIds,
      });

      return res.json({ message: 'Comment deleted' });
    }

    // Deep delete (nested reply or nested subtree)
    const located = locateNestedNodeById(doc.comments || [], commentId);
    if (!located?.node) {
      return res.status(404).json({ message: 'Comment/reply not found' });
    }

    const isAuthor = String(located.node.userId) === String(userId);
    if (!isOwner && !isAuthor) {
      return res.status(403).json({ message: 'Forbidden (owner or author required for deep delete)' });
    }

    // Collect IDs + media BEFORE removing
    const deletedNodeIds = collectNodeIdsDeep(located.node);
    const mediaKeysToDelete = collectMediaKeysDeep(located.node) || [];

    const resDeep = deleteCommentDeep(doc.comments || [], commentId);
    if (!resDeep?.deleted) {
      return res.status(404).json({ message: 'Comment/reply not found' });
    }

    doc.comments = resDeep.list;
    doc.markModified?.('comments');
    await doc.save();

    const keys = mediaKeysToDelete.length ? mediaKeysToDelete : (resDeep.mediaKeys || []);
    if (keys.length) { try { await deleteS3Objects(keys); } catch {} }

    // Pull notifications related to the deleted REPLY subtree.
    // Note: do NOT pass topLevelCommentId here — we didn't delete the top-level comment,
    // so the original "comment" notification should remain.
    await removeNotificationsForDeletedNodes({
      postType,
      postId: doc._id,
      topLevelCommentId: null,
      nodeIds: deletedNodeIds,
    });

    return res.json({ message: 'Comment deleted' });
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
