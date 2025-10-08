const safeStringify = (obj) => {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    },
    2
  );
};

/* ===== Tag helpers ===== */
const toStr = (v) => (v == null ? '' : String(v));

const photoMatches = (photo, photoId) => {
  const pid = toStr(photoId);
  return (
    toStr(photo?._id) === pid ||
    toStr(photo?.photoId) === pid ||   // in case you add this later
    toStr(photo?.photoKey) === pid     // your schema uses photoKey
  );
};

const removeUserFromPhotoTags = (photo, userId) => {
  if (!photo || !Array.isArray(photo.taggedUsers)) return 0;
  const uid = toStr(userId);
  const before = photo.taggedUsers.length;
  photo.taggedUsers = photo.taggedUsers.filter((t) => toStr(t?.userId) !== uid);
  return Math.max(0, before - photo.taggedUsers.length);
};

export const updatePromotions = ({
  state,          // draft of root OR promotions slice draft
  postId,         // promotion _id
  updates = {},
}) => {
  const sliceOrArray = state?.promotions ?? state;
  const listKey = 'promotions';
  const selectedKey = 'selectedPromotion';

  const list = Array.isArray(sliceOrArray) ? sliceOrArray : sliceOrArray?.[listKey];
  const selected = Array.isArray(sliceOrArray) ? null : sliceOrArray?.[selectedKey] || null;

  const applyCustomUpdate = (post) => {
    if (!post) return;
    const u = updates || {};

    // ==== TAG REMOVAL (Promotions have tags only in photos) ====

    // Remove THIS USER from ALL photos in this promotion
    // updates.__removeSelfFromAllPhotos = { userId }
    if (u.__removeSelfFromAllPhotos && Array.isArray(post.photos)) {
      const { userId } = u.__removeSelfFromAllPhotos;
      post.photos.forEach((p) => removeUserFromPhotoTags(p, userId));
    }

    // Remove THIS USER from ONE specific photo
    // updates.__removeSelfFromPhoto = { userId, photoId }
    if (u.__removeSelfFromPhoto && Array.isArray(post.photos)) {
      const { userId, photoId } = u.__removeSelfFromPhoto;
      const photo = post.photos.find((p) => photoMatches(p, photoId));
      if (photo) removeUserFromPhotoTags(photo, userId);
    }

    // (Optional) If you ever add post-level tags to Promotions later,
    // you can support __removeSelfFromPost here. For now it's a no-op.

    // ==== EXISTING BEHAVIOR BELOW ====

    // Update likes on the promotion itself
    if (u.__updatePostLikes) {
      const { likes, likesCount, liked } = u.__updatePostLikes;
      if (Array.isArray(likes)) post.likes = likes;                 // array
      if (typeof likesCount === 'number') post.likesCount = likesCount; // number
      if (typeof liked === 'boolean') post.liked = liked;           // boolean
    }

    // Append a top-level comment
    if (u.__appendComment) {
      post.comments = [...(post.comments || []), u.__appendComment];
    }

    // Append a reply
    if (u.__appendReply) {
      const { commentId, reply } = u.__appendReply;
      const insertReply = (arr) => {
        for (const c of arr || []) {
          if (!c || typeof c !== 'object') continue;
          if (String(c._id) === String(commentId)) {
            c.replies = [...(c.replies || []), reply];
            return true;
          }
          if (Array.isArray(c.replies) && insertReply(c.replies)) return true;
        }
        return false;
      };
      if (Array.isArray(post.comments)) insertReply(post.comments);
    }

    // Update a comment or reply (immutable rebuild)
    if (u.__updateComment) {
      const { commentId, updatedComment = {} } = u.__updateComment;

      const updateCommentDeep = (nodes) => {
        let changed = false;
        const next = (nodes || []).map((n) => {
          if (!n || typeof n !== 'object') return n;
          if (String(n._id) === String(commentId)) {
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
        if (changed) post.comments = next;
      }
    }

    // Delete a comment or reply
    if (u.__deleteComment) {
      const targetId = u.__deleteComment;
      const prune = (arr) =>
        (arr || [])
          .map((c) => {
            if (!c || typeof c !== 'object') return c;
            if (String(c._id) === String(targetId)) return null;
            if (Array.isArray(c.replies)) c.replies = prune(c.replies);
            return c;
          })
          .filter(Boolean);
      if (Array.isArray(post.comments)) post.comments = prune(post.comments);
    }

    // Update likes on a comment/reply
    if (u.__updateCommentLikes) {
      const { commentId: topId, replyId, likes = [] } = u.__updateCommentLikes;

      const updateReplyLikesDeep = (nodes) => {
        let changed = false;
        const next = (nodes || []).map((n) => {
          if (!n || typeof n !== 'object') return n;
          if (replyId && String(n._id) === String(replyId)) {
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
          const idx = post.comments.findIndex((c) => String(c?._id) === String(topId));
          if (idx !== -1) {
            const top = post.comments[idx];
            const r = updateReplyLikesDeep(top?.replies || []);
            if (r.changed) {
              post.comments = [
                ...post.comments.slice(0, idx),
                { ...top, replies: r.next },
                ...post.comments.slice(idx + 1),
              ];
            }
          } else {
            const r = updateReplyLikesDeep(post.comments);
            if (r.changed) post.comments = r.next;
          }
        } else {
          post.comments = post.comments.map((c) =>
            String(c._id) === String(topId) ? { ...c, likes } : c
          );
        }
      }
    }

    // Merge plain fields
    const plain = Object.entries(u).filter(([k]) => !k.startsWith('__'));
    if (plain.length) {
      Object.assign(post, Object.fromEntries(plain));
    }
  };

  if (Array.isArray(list)) {
    const idx = list.findIndex((p) => String(p?._id) === String(postId));
    if (idx !== -1) {
      applyCustomUpdate(list[idx]);
    }
  }

  if (selected && String(selected._id) === String(postId)) {
    applyCustomUpdate(selected);
  }
};
