const toStr = (v) => (v == null ? "" : String(v));

const getId = (x) => toStr(x?._id ?? x?.id);
const isSharedPost = (p) => {
  const t = p?.type || p?.postType || p?.canonicalType;
  return t === "sharedPost" || t === "sharedPosts";
};
const getOriginalId = (p) => (isSharedPost(p) ? getId(p.original) : "");

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
  alsoMatchSharedOriginal = true, // NEW: apply to SharedPost.original when IDs match
}) => {
  const postIdStr = toStr(postId);

  // ---- core mutators (operate on a single node: a post or an original) ----
  const applyCustomUpdateToNode = (node) => {
    if (!node) return false;

    const u = updates || {};
    let mutated = false;
    const mark = () => { mutated = true; };

    // A) Update likes on the node itself
    if (u.__updatePostLikes) {
      const val = u.__updatePostLikes;
      if (Array.isArray(val)) {
        node.likes = val; mark();
      } else if (val && typeof val === "object") {
        if (Array.isArray(val.likes)) { node.likes = val.likes; mark(); }
        if (typeof val.likesCount === "number") { node.likesCount = val.likesCount; mark(); }
        if (typeof val.liked === "boolean") { node.liked = val.liked; mark(); }
      }
    }

    // B) Append a top-level comment
    if (u.__appendComment) {
      node.comments = [...(node.comments || []), u.__appendComment];
      mark();
    }

    // C) Append a reply (by commentId)
    if (u.__appendReply) {
      const { commentId, reply } = u.__appendReply;

      const insertReply = (comments) => {
        for (const c of comments) {
          if (!c || typeof c !== "object") continue;
          if (toStr(c._id) === toStr(commentId)) {
            c.replies = [...(c.replies || []), reply];
            return true;
          }
          if (Array.isArray(c.replies) && insertReply(c.replies)) return true;
        }
        return false;
      };

      if (Array.isArray(node.comments) && insertReply(node.comments)) mark();
    }

    // D) Update a comment or reply by id
    if (u.__updateComment) {
      const { commentId, updatedComment = {} } = u.__updateComment;

      const updateComment = (comments) => {
        for (const c of comments) {
          if (!c || typeof c !== "object") continue;
          if (toStr(c._id) === toStr(commentId)) {
            Object.assign(c, updatedComment || {});
            return true;
          }
          if (Array.isArray(c.replies) && updateComment(c.replies)) return true;
        }
        return false;
      };

      if (Array.isArray(node.comments) && updateComment(node.comments)) mark();
    }

    // E) Delete a comment or reply by id
    if (u.__deleteComment) {
      const targetId = toStr(u.__deleteComment);

      const deleteComment = (comments) =>
        comments
          .map((c) => {
            if (!c || typeof c !== "object") return c;
            if (toStr(c._id) === targetId) return null;
            if (Array.isArray(c.replies)) c.replies = deleteComment(c.replies);
            return c;
          })
          .filter(Boolean);

      if (Array.isArray(node.comments)) {
        const before = node.comments.length;
        node.comments = deleteComment(node.comments);
        if (node.comments.length !== before) mark();
      }
    }

    // F) Update likes on a specific comment or reply
    if (u.__updateCommentLikes) {
      const { commentId: topId, replyId, likes = [] } = u.__updateCommentLikes;

      const updateReplyLikesDeep = (nodes) => {
        let changed = false;
        const next = (nodes || []).map((n) => {
          if (!n || typeof n !== "object") return n;
          if (toStr(n._id) === toStr(replyId)) {
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

      if (Array.isArray(node.comments)) {
        if (replyId) {
          const idx = (node.comments || []).findIndex((c) => toStr(c?._id) === toStr(topId));
          if (idx !== -1) {
            const top = node.comments[idx];
            const { next: newReplies, changed } = updateReplyLikesDeep(top?.replies || []);
            if (changed) {
              const newTop = { ...top, replies: newReplies };
              node.comments = [
                ...node.comments.slice(0, idx),
                newTop,
                ...node.comments.slice(idx + 1),
              ];
              mark();
            }
          } else {
            const { next: newComments, changed } = updateReplyLikesDeep(node.comments || []);
            if (changed) {
              node.comments = newComments;
              mark();
            }
          }
        } else {
          const mapped = (node.comments || []).map((c) =>
            toStr(c._id) === toStr(topId) ? { ...c, likes } : c
          );
          if (mapped !== node.comments) {
            node.comments = mapped;
            mark();
          }
        }
      }
    }

    // G) Remove user from post-level tags
    if (u.__removeSelfFromPost) {
      const { userId } = u.__removeSelfFromPost;
      const maybeStrip = (field) => {
        if (!Array.isArray(node[field])) return;
        const { next, removed } = removeUserFromTagArray(node[field], userId);
        if (removed > 0) { node[field] = next; mark(); }
      };
      maybeStrip("taggedUsers");
      maybeStrip("tags");
      maybeStrip("peopleTagged");
    }

    // H) Remove user from ALL photos
    if (u.__removeSelfFromAllPhotos) {
      const { userId } = u.__removeSelfFromAllPhotos;
      if (Array.isArray(node.photos)) {
        let removedAny = 0;
        node.photos.forEach((p) => { removedAny += removeUserFromPhotoTags(p, userId); });
        if (removedAny > 0) mark();
      }
    }

    // I) Remove user from ONE photo
    if (u.__removeSelfFromPhoto) {
      const { userId, photoId } = u.__removeSelfFromPhoto;
      if (Array.isArray(node.photos)) {
        const pid = toStr(photoId);
        const photoIdx = node.photos.findIndex(
          (p) =>
            toStr(p._id) === pid ||
            toStr(p.id) === pid ||
            toStr(p.photoId) === pid ||
            toStr(p.photoKey) === pid
        );
        if (photoIdx !== -1) {
          const target = node.photos[photoIdx];
          if (removeUserFromPhotoTags(target, userId) > 0) mark();
        }
      }
    }

    // J) Merge plain fields (non __ keys)
    const plainEntries = Object.entries(u).filter(([k]) => !k.startsWith("__"));
    if (plainEntries.length) {
      Object.assign(node, Object.fromEntries(plainEntries));
      mark();
    }

    return mutated;
  };

  // ---- apply to arrays in state (by postKeys) ----
  const tryApplyToItem = (item) => {
    if (!item) return false;

    // 1) If it's exactly the post
    if (getId(item) === postIdStr) {
      return applyCustomUpdateToNode(item);
    }

    // 2) If it's a shared wrapper and caller wants nested matching
    if (alsoMatchSharedOriginal && isSharedPost(item) && getOriginalId(item) === postIdStr) {
      // Apply updates to the original, not the wrapper
      if (!item.original) return false;
      const changed = applyCustomUpdateToNode(item.original);
      if (changed) {
        // preserve wrapper, bump identity
        item.original = { ...item.original };
      }
      return changed;
    }

    return false;
  };

  for (const key of postKeys || []) {
    const list = state?.[key];
    if (!Array.isArray(list)) continue;

    let changedAt = -1;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (tryApplyToItem(item)) {
        changedAt = i;
        break; // assume unique id
      }
    }

    if (changedAt !== -1) {
      // bump identity for Immer/react re-render
      state[key][changedAt] = { ...state[key][changedAt] };
    }
  }

  // ---- apply to selectedPost in state (if present) ----
  if (state?.selectedPost) {
    const sel = state.selectedPost;
    let did = false;

    if (getId(sel) === postIdStr) {
      did = applyCustomUpdateToNode(sel);
    } else if (alsoMatchSharedOriginal && isSharedPost(sel) && getOriginalId(sel) === postIdStr) {
      if (sel.original) {
        did = applyCustomUpdateToNode(sel.original);
        if (did) sel.original = { ...sel.original };
      }
    }

    if (did) {
      state.selectedPost = { ...state.selectedPost };
    }
  }
};
