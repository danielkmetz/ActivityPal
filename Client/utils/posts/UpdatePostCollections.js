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

function removeUserFromTagArray(arr, userId) {
  if (!Array.isArray(arr)) return { next: arr, removed: 0 };
  const uid = toStr(userId);
  const before = arr.length;
  const next = arr.filter((t) => {
    const tid = toStr(t?.userId ?? t?._id ?? t?.id ?? t);
    return tid !== uid;
  });
  return { next, removed: before - next.length };
}

function removeUserFromPhotoTags(photo, userId) {
  if (!photo || !Array.isArray(photo.taggedUsers)) return 0;
  const { next, removed } = removeUserFromTagArray(photo.taggedUsers, userId);
  if (removed > 0) photo.taggedUsers = next;
  return removed;
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
    if (!post) return false;

    const u = updates || {};
    let mutated = false;
    const mark = () => { mutated = true; };

    // 6) Update likes on the post itself
    if (u.__updatePostLikes) {
      const val = u.__updatePostLikes;
      if (Array.isArray(val)) {
        post.likes = val; mark();
      } else if (val && typeof val === 'object') {
        if (Array.isArray(val.likes)) { post.likes = val.likes; mark(); }
        if (typeof val.likesCount === 'number') { post.likesCount = val.likesCount; mark(); }
        if (typeof val.liked === 'boolean') { post.liked = val.liked; mark(); }
      }
    }

    // 0) Append a top-level comment
    if (u.__appendComment) {
      post.comments = [...(post.comments || []), u.__appendComment];
      mark();
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

      if (Array.isArray(post.comments) && insertReply(post.comments)) mark();
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

      if (Array.isArray(post.comments) && updateComment(post.comments)) mark();
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
        const before = post.comments.length;
        post.comments = deleteComment(post.comments);
        if (post.comments.length !== before) mark();
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
              mark();
            }
          } else {
            const { next: newComments, changed } = updateReplyLikesDeep(post.comments || []);
            if (changed) {
              post.comments = newComments;
              mark();
            }
          }
        } else {
          const mapped = (post.comments || []).map((c) =>
            String(c._id) === String(topId) ? { ...c, likes } : c
          );
          if (mapped !== post.comments) {
            post.comments = mapped;
            mark();
          }
        }
      }
    }

    /* ---------- A) remove from post-level (handles ids OR objects) ---------- */
    if (u.__removeSelfFromPost) {
      const { userId } = u.__removeSelfFromPost;
      // Try canonical + a few common alternates
      const bumpIfRemoved = (field) => {
        if (!Array.isArray(post[field])) return;
        const { next, removed } = removeUserFromTagArray(post[field], userId);
        if (removed > 0) { post[field] = next; mark(); }
      };
      bumpIfRemoved('taggedUsers');   // canonical
      bumpIfRemoved('tags');          // alt naming
      bumpIfRemoved('peopleTagged');  // alt naming
    }

    /* ---------- B) remove from ALL photos ---------- */
    if (u.__removeSelfFromAllPhotos) {
      const { userId } = u.__removeSelfFromAllPhotos;
      if (Array.isArray(post.photos)) {
        let removedAny = 0;
        post.photos.forEach((p) => { removedAny += removeUserFromPhotoTags(p, userId); });
        if (removedAny > 0) mark();
      }
    }

    /* ---------- C) remove from ONE photo ---------- */
    if (u.__removeSelfFromPhoto) {
      const { userId, photoId } = u.__removeSelfFromPhoto;

      if (Array.isArray(post.photos)) {
        const pid = toStr(photoId);
        const photoIdx = post.photos.findIndex(
          (p) => toStr(p._id) === pid || toStr(p.id) === pid || toStr(p.photoId) === pid || toStr(p.photoKey) === pid
        );

        if (photoIdx !== -1) {
          const target = post.photos[photoIdx];
          if (removeUserFromPhotoTags(target, userId) > 0) mark();
        }
      }
    }

    /* ---------- merge plain fields ---------- */
    const plainEntries = Object.entries(u).filter(([k]) => !k.startsWith('__'));
    if (plainEntries.length) {
      Object.assign(post, Object.fromEntries(plainEntries));
      mark();
    }

    return mutated;
  };

  const postIdStr = String(postId);

  // Apply to lists that contain the post
  for (const key of postKeys || []) {
    const list = state?.[key];
    if (!Array.isArray(list)) continue;
    const idx = list.findIndex((p) => {
      const pid = String(p?._id ?? p?.id);
      return pid === postIdStr;
    });
    if (idx === -1) continue;

    const changed = applyCustomUpdate(list[idx]);
    if (changed) {
      // bump object identity so memoized components re-render
      state[key][idx] = { ...state[key][idx] };
    }
  }

  // Apply to selectedReview / selectedPost if it matches
  if (state?.selectedPost && String(state.selectedPost?._id ?? state.selectedPost?.id) === postIdStr) {
    if (applyCustomUpdate(state.selectedPost)) {
      state.selectedPost = { ...state.selectedPost };
    }
  } else if (state?.selectedReview && String(state.selectedReview?._id ?? state.selectedReview?.id) === postIdStr) {
    if (applyCustomUpdate(state.selectedReview)) {
      state.selectedReview = { ...state.selectedReview };
    }
  }
};
