/* ===== small helpers ===== */
const toStr = (v) => (v == null ? '' : String(v));
const getId = (x) => toStr(x?._id ?? x?.id);

const isSharedPost = (p) => {
  const t = p?.type || p?.postType || p?.canonicalType;
  return t === 'sharedPost' || t === 'sharedPosts';
};
const getOriginalId = (p) => (isSharedPost(p) ? getId(p.original) : '');

const photoMatches = (photo, photoId) => {
  const pid = toStr(photoId);
  return (
    toStr(photo?._id) === pid ||
    toStr(photo?.photoId) === pid ||
    toStr(photo?.photoKey) === pid
  );
};

const removeUserFromPhotoTags = (photo, userId) => {
  if (!photo || !Array.isArray(photo.taggedUsers)) return 0;
  const uid = toStr(userId);
  const before = photo.taggedUsers.length;
  photo.taggedUsers = photo.taggedUsers.filter((t) => toStr(t?.userId) !== uid);
  return Math.max(0, before - photo.taggedUsers.length);
};

/* apply all "updates" to a single node (a Post or SharedPost.original) */
const applyCustomUpdateToNode = (post, updates) => {
  if (!post) return false;
  const u = updates || {};
  let mutated = false;
  const mark = () => { mutated = true; };

  /* ---------- Tag removals (post-level + photos) ---------- */

  // Remove THIS USER from post-level tags (if present)
  // u.__removeSelfFromPost = { userId }
  if (u.__removeSelfFromPost && Array.isArray(post.taggedUsers)) {
    const { userId } = u.__removeSelfFromPost;
    const before = post.taggedUsers.length;
    post.taggedUsers = post.taggedUsers.filter((t) => toStr(t?.userId) !== toStr(userId));
    if (post.taggedUsers.length !== before) mark();
  }

  // Remove THIS USER from ALL photos
  // u.__removeSelfFromAllPhotos = { userId }
  if (u.__removeSelfFromAllPhotos && Array.isArray(post.photos)) {
    const { userId } = u.__removeSelfFromAllPhotos;
    let removedAny = 0;
    post.photos.forEach((p) => { removedAny += removeUserFromPhotoTags(p, userId); });
    if (removedAny > 0) mark();
  }

  // Remove THIS USER from ONE photo
  // u.__removeSelfFromPhoto = { userId, photoId }
  if (u.__removeSelfFromPhoto && Array.isArray(post.photos)) {
    const { userId, photoId } = u.__removeSelfFromPhoto;
    const photo = post.photos.find((p) => photoMatches(p, photoId));
    if (photo && removeUserFromPhotoTags(photo, userId) > 0) mark();
  }

  /* ---------- Likes on the post ---------- */

  if (u.__updatePostLikes) {
    const val = u.__updatePostLikes;
    if (Array.isArray(val)) { post.likes = val; mark(); }
    else if (val && typeof val === 'object') {
      if (Array.isArray(val.likes))          { post.likes = val.likes; mark(); }
      if (typeof val.likesCount === 'number'){ post.likesCount = val.likesCount; mark(); }
      if (typeof val.liked === 'boolean')    { post.liked = val.liked; mark(); }
    }
  }

  /* ---------- Comments & replies ---------- */

  // Append top-level comment
  if (u.__appendComment) {
    post.comments = [...(post.comments || []), u.__appendComment];
    mark();
  }

  // Append reply
  if (u.__appendReply) {
    const { commentId, reply } = u.__appendReply;
    const insertReply = (arr) => {
      for (const c of arr || []) {
        if (!c || typeof c !== 'object') continue;
        if (toStr(c._id) === toStr(commentId)) {
          c.replies = [...(c.replies || []), reply];
          return true;
        }
        if (Array.isArray(c.replies) && insertReply(c.replies)) return true;
      }
      return false;
    };
    if (Array.isArray(post.comments) && insertReply(post.comments)) mark();
  }

  // Update a comment or reply (immutable rebuild)
  if (u.__updateComment) {
    const { commentId, updatedComment = {} } = u.__updateComment;

    const updateCommentDeep = (nodes) => {
      let changed = false;
      const next = (nodes || []).map((n) => {
        if (!n || typeof n !== 'object') return n;
        if (toStr(n._id) === toStr(commentId)) {
          changed = true;
          return { ...n, ...updatedComment };
        }
        if (n.replies?.length) {
          const { next: childNext, changed: childChanged } = updateCommentDeep(n.replies);
          if (childChanged) {
            changed = true;
            return { ...n, replies: childNext };
          }
        }
        return n;
      });
      return { next, changed };
    };

    if (Array.isArray(post.comments)) {
      const { next, changed } = updateCommentDeep(post.comments);
      if (changed) { post.comments = next; mark(); }
    }
  }

  // Delete a comment or reply
  if (u.__deleteComment) {
    const targetId = toStr(u.__deleteComment);
    const prune = (arr) =>
      (arr || [])
        .map((c) => {
          if (!c || typeof c !== 'object') return c;
          if (toStr(c._id) === targetId) return null;
          if (Array.isArray(c.replies)) c.replies = prune(c.replies);
          return c;
        })
        .filter(Boolean);
    if (Array.isArray(post.comments)) {
      const before = post.comments.length;
      post.comments = prune(post.comments);
      if (post.comments.length !== before) mark();
    }
  }

  // Update likes on a comment/reply
  if (u.__updateCommentLikes) {
    const { commentId: topId, replyId, likes = [] } = u.__updateCommentLikes;

    const updateReplyLikesDeep = (nodes) => {
      let changed = false;
      const next = (nodes || []).map((n) => {
        if (!n || typeof n !== 'object') return n;
        if (replyId && toStr(n._id) === toStr(replyId)) {
          changed = true;
          return { ...n, likes };
        }
        if (n.replies?.length) {
          const r = updateReplyLikesDeep(n.replies);
          if (r.changed) {
            changed = true;
            return { ...n, replies: r.next };
          }
        }
        return n;
      });
      return { next, changed };
    };

    if (Array.isArray(post.comments)) {
      if (replyId) {
        const idx = post.comments.findIndex((c) => toStr(c?._id) === toStr(topId));
        if (idx !== -1) {
          const top = post.comments[idx];
          const r = updateReplyLikesDeep(top?.replies || []);
          if (r.changed) {
            post.comments = [
              ...post.comments.slice(0, idx),
              { ...top, replies: r.next },
              ...post.comments.slice(idx + 1),
            ];
            mark();
          }
        } else {
          const r = updateReplyLikesDeep(post.comments || []);
          if (r.changed) { post.comments = r.next; mark(); }
        }
      } else {
        const mapped = (post.comments || []).map((c) =>
          toStr(c._id) === toStr(topId) ? { ...c, likes } : c
        );
        if (mapped !== post.comments) { post.comments = mapped; mark(); }
      }
    }
  }

  // Merge plain fields
  const plain = Object.entries(u).filter(([k]) => !k.startsWith('__'));
  if (plain.length) { Object.assign(post, Object.fromEntries(plain)); mark(); }

  return mutated;
};

/**
 * Unified promotions updater (slice or root):
 * - Matches by promotion _id
 * - Also updates a SharedPost.original if its id matches `postId`
 * - Bumps identities so React re-renders
 */
export const updatePromotions = ({
  state,                 // draft of root OR promotions slice draft
  postId,                // promotion/original _id
  updates = {},
  alsoMatchSharedOriginal = true,
}) => {
  const sliceOrArray = state?.promotions ?? state;
  const listKey = 'promotions';
  const selectedKey = 'selectedPromotion';

  const list = Array.isArray(sliceOrArray) ? sliceOrArray : sliceOrArray?.[listKey];
  const selected = Array.isArray(sliceOrArray) ? null : sliceOrArray?.[selectedKey] || null;

  const pid = toStr(postId);

  const tryApply = (item) => {
    if (!item) return false;
    // direct match
    if (getId(item) === pid) {
      const changed = applyCustomUpdateToNode(item, updates);
      if (changed) Object.assign(item, { ...item }); // bump identity
      return changed;
    }
    // SharedPost.original match
    if (alsoMatchSharedOriginal && isSharedPost(item) && getOriginalId(item) === pid && item.original) {
      const changed = applyCustomUpdateToNode(item.original, updates);
      if (changed) item.original = { ...item.original }; // bump nested identity
      return changed;
    }
    return false;
  };

  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i++) {
      if (tryApply(list[i])) {
        list[i] = { ...list[i] }; // bump wrapper identity
        break;
      }
    }
  }

  if (selected && (getId(selected) === pid || (alsoMatchSharedOriginal && isSharedPost(selected) && getOriginalId(selected) === pid))) {
    tryApply(selected);
    if (!Array.isArray(sliceOrArray)) {
      sliceOrArray[selectedKey] = { ...sliceOrArray[selectedKey] };
    }
  }
};
