const router = require('express').Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken');
const { Post } = require('../models/Post'); // ✅ unified Post model
const User = require('../models/User');
const Business = require('../models/Business');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const deleteS3Objects = require('../utils/deleteS3Objects');

/* ----------------------------- Helpers ----------------------------- */

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));

function parseMedia(media) {
  if (!media) return { photoKey: null, mediaType: null };
  const mediaType = ['image', 'video'].includes(media.mediaType) ? media.mediaType : null;
  return media.photoKey ? { photoKey: media.photoKey, mediaType } : { photoKey: null, mediaType: null };
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

function locateNestedNodeById(comments = [], targetId) {
  for (const c of comments) {
    if (String(c?._id) === String(targetId)) {
      return { node: c, parentArr: comments, index: comments.indexOf(c), topLevelId: c._id, parentAuthorId: c.userId, isTopLevel: true };
    }
    const found = findReplyDeep(c.replies || [], targetId, c._id);
    if (found?.node) return found;
  }
  return null;
}

function deleteCommentDeep(list = [], targetId) {
  let deleted = false;
  const mediaKeys = [];
  const next = [];

  for (const c of list) {
    if (String(c?._id) === String(targetId)) {
      deleted = true;
      mediaKeys.push(...collectMediaKeysDeep(c));
      continue; // drop this node
    }

    if (Array.isArray(c?.replies) && c.replies.length) {
      const res = deleteCommentDeep(c.replies, targetId);
      if (res.deleted) deleted = true;
      if (res.mediaKeys.length) mediaKeys.push(...res.mediaKeys);
      c.replies = res.list;
    }
    next.push(c);
  }

  return { deleted, mediaKeys, list: next };
}

async function notifyOwner({ post, type, message, relatedUserId, commentIds }) {
  const ownerId = post?.ownerId;
  const ownerRef = post?.ownerModel; // 'User' | 'Business'
  if (!ownerId) return;

  try {
    if (ownerRef === 'Business') {
      const biz = await Business.findById(ownerId);
      if (!biz) return;
      biz.notifications = biz.notifications || [];
      biz.notifications.push({
        type,
        message,
        relatedId: relatedUserId,
        typeRef: 'User',
        targetId: post._id,
        targetRef: 'Post',
        commentId: commentIds?.commentId || null,
        replyId: commentIds?.replyId || null,
        read: false,
        postType: post.type,
        createdAt: new Date(),
      });
      await biz.save();
    } else {
      const user = await User.findById(ownerId);
      if (!user) return;
      user.notifications = user.notifications || [];
      user.notifications.push({
        type,
        message,
        relatedId: relatedUserId,
        typeRef: 'User',
        targetId: post._id,
        targetRef: 'Post',
        commentId: commentIds?.commentId || null,
        replyId: commentIds?.replyId || null,
        read: false,
        postType: post.type,
        createdAt: new Date(),
      });
      await user.save();
    }
  } catch { /* best-effort */ }
}

async function removeNotificationsForDeletedNodes({ post, topLevelCommentId = null, nodeIds = [] }) {
  try {
    const postObjectId = oid(post._id);
    const idObjs = nodeIds
      .map(id => (isOid(id) ? oid(id) : null))
      .filter(Boolean);

    if (idObjs.length) {
      await User.updateMany(
        {},
        {
          $pull: {
            notifications: {
              postType: post.type,
              targetId: postObjectId,
              $or: [
                { type: 'like', replyId: { $in: idObjs } },
                { type: 'reply', replyId: { $in: idObjs } },
              ],
            },
          },
        }
      );
    }

    if (topLevelCommentId) {
      const topId = isOid(topLevelCommentId) ? oid(topLevelCommentId) : null;
      if (topId) {
        await User.updateMany(
          {},
          { $pull: { notifications: { type: 'comment', postType: post.type, targetId: postObjectId, commentId: topId } } }
        );
        await Business.updateMany(
          {},
          { $pull: { notifications: { type: 'comment', postType: post.type, targetId: postObjectId, commentId: topId } } }
        );
      }
    }
  } catch { /* best-effort */ }
}

/* ------------------------------ Middleware ------------------------------ */

async function loadPost(req, res, next) {
  const { postId } = req.params;
  if (!isOid(postId)) return res.status(400).json({ message: 'Invalid postId' });

  const post = await Post.findById(postId);
  if (!post) return res.status(404).json({ message: 'Post not found' });

  req.post = post; // Mongoose doc
  next();
}

/* -------------------------------- Routes -------------------------------- */

// Add comment
router.post('/:postId/comments', verifyToken, loadPost, async (req, res) => {
  const post = req.post;
  const userId = req.user?.id;
  const fullName =
    req.user?.fullName ||
    [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') ||
    'Unknown';

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const mediaPayload = parseMedia(req.body?.media);
    const comment = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText: String(req.body?.commentText || ''),
      date: new Date(),
      likes: [],
      replies: [],
      media: mediaPayload,
    };

    if (!Array.isArray(post.comments)) post.comments = [];
    post.comments.push(comment);
    post.markModified('comments');
    await post.save();

    // Notify owner (if not self)
    if (post.ownerId && String(post.ownerId) !== String(userId)) {
      await notifyOwner({
        post,
        type: 'comment',
        message: `${fullName} commented on your ${post.type}`,
        relatedUserId: userId,
        commentIds: { commentId: comment._id },
      });
    }

    const mediaUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;
    const responseComment = mediaPayload.photoKey
      ? { ...comment, media: { ...mediaPayload, mediaUrl } }
      : comment;

    return res.status(201).json({ message: 'Comment added', comment: responseComment });
  } catch (e) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Add nested reply
router.post('/:postId/comments/:commentId/replies', verifyToken, loadPost, async (req, res) => {
  const post = req.post;
  const { commentId } = req.params;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const fullName =
    req.user?.fullName ||
    [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') ||
    'Unknown';

  try {
    const mediaPayload = parseMedia(req.body?.media);
    const reply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText: String(req.body?.commentText || ''),
      date: new Date(),
      likes: [],
      replies: [],
      media: mediaPayload,
    };

    let inserted = false;
    let parentAuthorId = null;
    let topLevelId = null;

    const top = post.comments?.id?.(commentId);
    if (top) {
      parentAuthorId = top.userId;
      topLevelId = top._id;
      top.replies = top.replies || [];
      top.replies.push(reply);
      inserted = true;
    } else {
      for (const c of (post.comments || [])) {
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

    post.markModified('comments');
    await post.save();

    // Notify parent author (skip self)
    if (parentAuthorId && String(parentAuthorId) !== String(userId)) {
      const targetUser = await User.findById(parentAuthorId);
      if (targetUser) {
        targetUser.notifications = targetUser.notifications || [];
        targetUser.notifications.push({
          type: 'reply',
          message: `${fullName} replied to your comment`,
          relatedId: userId,
          typeRef: 'User',
          targetId: post._id,
          targetRef: 'Post',
          commentId: topLevelId,
          replyId: reply._id,
          read: false,
          postType: post.type,
          createdAt: new Date(),
        });
        await targetUser.save();
      }
    }

    const mediaUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;
    const responseReply = mediaPayload.photoKey ? { ...reply, media: { ...mediaPayload, mediaUrl } } : reply;

    return res.status(201).json({ message: 'Reply added', reply: responseReply });
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Like/unlike comment or reply
router.put('/:postId/comments/:commentId/like', verifyToken, loadPost, async (req, res) => {
  const post = req.post;
  const { commentId } = req.params;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const fullName =
    req.user?.fullName ||
    [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') ||
    'Unknown';

  try {
    if (!Array.isArray(post.comments)) return res.status(404).json({ message: 'No comments' });

    let target = null;
    let parentAuthorId = null;
    let topLevelId = null;

    const top = post.comments.id?.(commentId);
    if (top) {
      target = top;
      parentAuthorId = top.userId;
      topLevelId = top._id;
    } else {
      for (const c of (post.comments || [])) {
        const found = findReplyDeep(c.replies || [], commentId, c._id);
        if (found?.node) {
          target = found.node;
          parentAuthorId = found.parentAuthorId;
          topLevelId = found.topLevelId || c._id;
          break;
        }
      }
    }

    if (!target) return res.status(404).json({ message: 'Comment/reply not found' });

    target.likes = Array.isArray(target.likes) ? target.likes : [];
    const idx = target.likes.findIndex((l) => String(l.userId) === String(userId));
    const isUnliking = idx > -1;
    if (isUnliking) target.likes.splice(idx, 1);
    else target.likes.push({ userId, fullName, date: new Date() });

    post.markModified('comments');
    await post.save();

    // Notification (best-effort)
    if (parentAuthorId && String(parentAuthorId) !== String(userId)) {
      const targetUser = await User.findById(parentAuthorId);
      if (targetUser) {
        const existsIdx =
          targetUser.notifications?.findIndex(
            (n) =>
              n.type === 'like' &&
              String(n.relatedId) === String(userId) &&
              n.typeRef === 'User' &&
              String(n.targetId) === String(post._id) &&
              String(n.commentId) === String(topLevelId || commentId) &&
              String(n.replyId || commentId) === String(commentId) &&
              n.postType === post.type
          ) ?? -1;

        if (!isUnliking && existsIdx === -1) {
          targetUser.notifications = targetUser.notifications || [];
          targetUser.notifications.push({
            type: 'like',
            message: `${fullName} liked your comment`,
            relatedId: userId,
            typeRef: 'User',
            targetId: post._id,
            targetRef: 'Post',
            commentId: topLevelId || commentId,
            replyId: commentId,
            read: false,
            postType: post.type,
            createdAt: new Date(),
          });
          await targetUser.save();
        } else if (isUnliking && existsIdx !== -1) {
          targetUser.notifications.splice(existsIdx, 1);
          await targetUser.save();
        }
      }
    }

    return res.json({
      ok: true,
      message: 'Like toggled',
      postId: String(post._id),
      commentId: String(commentId),
      topLevelCommentId: String(topLevelId || commentId),
      likes: target.likes,
    });
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Edit comment or reply (author OR post owner)
router.patch('/:postId/comments/:commentId', verifyToken, loadPost, async (req, res) => {
  const post = req.post;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { commentId } = req.params;
  const mediaPayload = parseMedia(req.body?.media);
  const newText = req.body?.newText;

  try {
    const isOwner = post.ownerId && String(post.ownerId) === String(userId);

    if (!Array.isArray(post.comments)) {
      return res.status(404).json({ message: 'No comments on this post' });
    }

    let target = null;
    let isAuthor = false;
    let isTopLevel = false;

    const top = post.comments.id?.(commentId);
    if (top) {
      target = top;
      isTopLevel = true;
      isAuthor = String(top.userId) === String(userId);
    } else {
      const located = locateNestedNodeById(post.comments || [], commentId);
      if (located?.node) {
        target = located.node;
        isTopLevel = false;
        isAuthor = String(located.node.userId) === String(userId);
      }
    }

    if (!target) return res.status(404).json({ message: 'Comment/reply not found' });
    if (!isOwner && !isAuthor) return res.status(403).json({ message: 'Forbidden' });

    const oldKey = target?.media?.photoKey || null;
    const newKey = mediaPayload.photoKey || null;
    const deleteOldAfterSave = oldKey && oldKey !== newKey ? [oldKey] : [];

    if (typeof newText === 'string') target.commentText = newText;
    target.media = mediaPayload;
    target.updatedAt = new Date();

    post.markModified('comments');
    await post.save();

    if (deleteOldAfterSave.length) {
      try { await deleteS3Objects(deleteOldAfterSave); } catch {}
    }

    const mediaUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;
    const updatedComment = {
      _id: target._id,
      userId: target.userId,
      fullName: target.fullName,
      commentText: target.commentText,
      date: target.date,
      updatedAt: target.updatedAt,
      likes: Array.isArray(target.likes) ? target.likes : [],
      replies: Array.isArray(target.replies) ? target.replies : [],
      media: mediaPayload.photoKey ? { ...mediaPayload, mediaUrl } : mediaPayload,
    };

    return res.json({ message: 'Comment updated', updatedComment, isTopLevel });
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Delete comment or reply (author OR post owner)
router.delete('/:postId/comments/:commentId', verifyToken, loadPost, async (req, res) => {
  const post = req.post;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { commentId } = req.params;

  try {
    const isOwner = post.ownerId && String(post.ownerId) === String(userId);
    if (!Array.isArray(post.comments)) return res.status(404).json({ message: 'No comments on this post' });

    // top-level?
    const top = post.comments.id?.(commentId);
    if (top) {
      if (!isOwner && String(top.userId) !== String(userId)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const deletedNodeIds = collectNodeIdsDeep(top);
      const keys = collectMediaKeysDeep(top) || [];
      top.deleteOne();
      post.markModified('comments');
      await post.save();

      if (keys.length) { try { await deleteS3Objects(keys); } catch {} }

      await removeNotificationsForDeletedNodes({
        post,
        topLevelCommentId: top._id,
        nodeIds: deletedNodeIds,
      });

      return res.json({ message: 'Comment deleted' });
    }

    // nested delete
    const located = locateNestedNodeById(post.comments || [], commentId);
    if (!located?.node) return res.status(404).json({ message: 'Comment/reply not found' });

    const isAuthor = String(located.node.userId) === String(userId);
    if (!isOwner && !isAuthor) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const deletedNodeIds = collectNodeIdsDeep(located.node);
    const mediaKeysToDelete = collectMediaKeysDeep(located.node) || [];

    const resDeep = deleteCommentDeep(post.comments || [], commentId);
    if (!resDeep?.deleted) return res.status(404).json({ message: 'Comment/reply not found' });

    post.comments = resDeep.list;
    post.markModified('comments');
    await post.save();

    const keys = mediaKeysToDelete.length ? mediaKeysToDelete : (resDeep.mediaKeys || []);
    if (keys.length) { try { await deleteS3Objects(keys); } catch {} }

    await removeNotificationsForDeletedNodes({
      post,
      topLevelCommentId: null, // top-level remains
      nodeIds: deletedNodeIds,
    });

    return res.json({ message: 'Comment deleted' });
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
