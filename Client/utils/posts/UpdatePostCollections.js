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

const toStr = (v) => (v == null ? '' : String(v));

function removeIdFromIdArray(arr, userId) {
  if (!Array.isArray(arr)) return { next: arr, removed: 0 };
  const uid = toStr(userId);
  const before = arr.length;
  const next = arr.filter((id) => toStr(id) !== uid);
  return { next, removed: before - next.length };
}

function removeUserFromPhotoTags(photo, userId) {
  if (!photo || !Array.isArray(photo.taggedUsers)) return 0;
  const uid = toStr(userId);
  const before = photo.taggedUsers.length;
  photo.taggedUsers = photo.taggedUsers.filter((t) => toStr(t.userId) !== uid);
  return before - photo.taggedUsers.length;
}

export const updatePostCollections = ({
  state,
  postId,
  updates = {},
  postKeys = [],
  debug = true,             // kept for API compatibility; unused
  label = 'updatePostCollections' // kept for API compatibility; unused
}) => {
  const applyCustomUpdate = (post) => {
    if (!post) return;

    const u = updates || {};

    // 6) Update likes on the post itself
    if (u.__updatePostLikes) {
      const val = u.__updatePostLikes;
      if (Array.isArray(val)) {
        // legacy shape: __updatePostLikes = [ ...likes ]
        post.likes = val;
      } else if (val && typeof val === 'object') {
        // new shape: __updatePostLikes = { likes, likesCount?, liked? }
        if (Array.isArray(val.likes)) post.likes = val.likes;
        if (typeof val.likesCount === 'number') post.likesCount = val.likesCount;
        if (typeof val.liked === 'boolean') post.liked = val.liked;
      }
    }

    // 0) Append a top-level comment
    if (u.__appendComment) {
      post.comments = [...(post.comments || []), u.__appendComment];
    }

    // 1) Append a reply to a specific comment
    if (u.__appendReply) {
      const { commentId, reply } = u.__appendReply;

      const insertReply = (comments) => {
        for (const c of comments) {
          if (!c || typeof c !== 'object') continue;
          if (c._id === commentId) {
            c.replies = [...(c.replies || []), reply];
            return true;
          }
          if (Array.isArray(c.replies) && insertReply(c.replies)) return true;
        }
        return false;
      };

      if (Array.isArray(post.comments)) {
        insertReply(post.comments);
      }
    }

    // 2) Update a comment or reply
    if (u.__updateComment) {
      const { commentId, updatedComment = {} } = u.__updateComment;

      const updateComment = (comments) => {
        for (const c of comments) {
          if (!c || typeof c !== 'object') continue;
          if (c._id === commentId) {
            Object.assign(c, updatedComment || {});
            return true;
          }
          if (Array.isArray(c.replies) && updateComment(c.replies)) return true;
        }
        return false;
      };

      if (Array.isArray(post.comments)) {
        updateComment(post.comments);
      }
    }

    // 3) Delete a comment or reply
    if (u.__deleteComment) {
      const targetId = u.__deleteComment;

      const deleteComment = (comments) =>
        comments
          .map((c) => {
            if (!c || typeof c !== 'object') return c;
            if (c._id === targetId) return null;
            if (Array.isArray(c.replies)) c.replies = deleteComment(c.replies);
            return c;
          })
          .filter(Boolean);

      if (Array.isArray(post.comments)) {
        post.comments = deleteComment(post.comments);
      }
    }

    // 4) Update likes on a comment or reply (immutable rebuild so lists re-render)
    if (u.__updateCommentLikes) {
      const { commentId: topId, replyId, likes = [] } = u.__updateCommentLikes;

      const updateReplyLikesDeep = (nodes) => {
        let changed = false;
        const next = (nodes || []).map((n) => {
          if (!n || typeof n !== 'object') return n;
          if (String(n._id) === String(replyId)) {
            changed = true;
            return { ...n, likes };
          }
          if (n.replies?.length) {
            const { next: childNext, changed: childChanged } = updateReplyLikesDeep(n.replies);
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
        if (replyId) {
          const idx = (post.comments || []).findIndex((c) => String(c?._id) === String(topId));
          if (idx !== -1) {
            const top = post.comments[idx];
            const { next: newReplies, changed } = updateReplyLikesDeep(top?.replies || []);
            if (changed) {
              const newTop = { ...top, replies: newReplies };
              post.comments = [
                ...post.comments.slice(0, idx),
                newTop,
                ...post.comments.slice(idx + 1),
              ];
            }
          } else {
            const { next: newComments, changed } = updateReplyLikesDeep(post.comments || []);
            if (changed) {
              post.comments = newComments;
            }
          }
        } else {
          post.comments = (post.comments || []).map((c) =>
            String(c._id) === String(topId) ? { ...c, likes } : c
          );
        }
      }
    }

    /* ---------- A) remove from post-level ---------- */
    if (u.__removeSelfFromPost) {
      const { userId } = u.__removeSelfFromPost;
      if (Array.isArray(post.taggedUsers)) {
        const { next } = removeIdFromIdArray(post.taggedUsers, userId);
        post.taggedUsers = next;
      }
    }

    /* ---------- B) remove from ALL photos ---------- */
    if (u.__removeSelfFromAllPhotos) {
      const { userId } = u.__removeSelfFromAllPhotos;
      if (Array.isArray(post.photos)) {
        post.photos.forEach((p) => {
          removeUserFromPhotoTags(p, userId);
        });
      }
    }

    /* ---------- C) remove from ONE photo ---------- */
    if (u.__removeSelfFromPhoto) {
      const { userId, photoId } = u.__removeSelfFromPhoto;

      if (Array.isArray(post.photos)) {
        const pid = toStr(photoId);
        const photoIdx = post.photos.findIndex(
          (p) => toStr(p._id) === pid || toStr(p.photoId) === pid || toStr(p.photoKey) === pid
        );

        if (photoIdx !== -1) {
          const target = post.photos[photoIdx];
          removeUserFromPhotoTags(target, userId);
        }
      }
    }

    /* ---------- merge plain fields ---------- */
    const plainEntries = Object.entries(u).filter(([k]) => !k.startsWith('__'));
    if (plainEntries.length) {
      Object.assign(post, Object.fromEntries(plainEntries));
    }
  };

  // Apply to lists that contain the post
  for (const key of postKeys || []) {
    const list = state?.[key];
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex((p) => String(p?._id) === String(postId));
    if (idx === -1) continue;
    applyCustomUpdate(list[idx]);
  }

  // Apply to selectedReview / selectedPost if it matches
  let sel = null;
  if (state?.selectedPost?._id === postId) {
    sel = state.selectedPost;
  } else if (state?.selectedReview?._id === postId) {
    sel = state.selectedReview;
  }
  if (sel) applyCustomUpdate(sel);
};
