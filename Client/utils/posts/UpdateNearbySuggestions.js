const toStr = (v) => (v == null ? "" : String(v));
const getId = (x) => toStr(x?._id ?? x?.id);
const isSharedPost = (p) => {
  const t = p?.type || p?.postType || p?.canonicalType;
  return t === "sharedPost" || t === "sharedPosts";
};
const getOriginalId = (p) => (isSharedPost(p) ? getId(p.original) : "");

// --- mutate a single node (a Post or the `original` inside a SharedPost) ---
const applyCustomUpdateToNode = (node, updates, log) => {
  if (!node) return false;
  const u = updates || {};
  let mutated = false;
  const mark = () => { mutated = true; };

  try {
    // 1) Update likes on the post itself
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
  } catch (err) {
    log.error("Failed __updatePostLikes:", err);
  }

  try {
    // 2) Append a top-level comment
    if (u.__appendComment) {
      node.comments = [...(node.comments || []), u.__appendComment];
      mark();
    }
  } catch (err) {
    log.error("Failed __appendComment:", err);
  }

  try {
    // 3) Append a reply
    if (u.__appendReply) {
      const { commentId, reply } = u.__appendReply;
      const insertReply = (comments) => {
        for (const c of comments) {
          if (toStr(c?._id) === toStr(commentId)) {
            c.replies = [...(c.replies || []), reply];
            return true;
          }
          if (Array.isArray(c?.replies) && insertReply(c.replies)) return true;
        }
        return false;
      };
      if (Array.isArray(node.comments) && insertReply(node.comments)) mark();
    }
  } catch (err) {
    log.error("Failed __appendReply:", err);
  }

  try {
    // 4) Update a comment or reply
    if (u.__updateComment) {
      const { commentId, updatedComment = {} } = u.__updateComment;
      const updateComment = (comments) => {
        for (const c of comments) {
          if (toStr(c?._id) === toStr(commentId)) {
            Object.assign(c, updatedComment || {});
            return true;
          }
          if (Array.isArray(c?.replies) && updateComment(c.replies)) return true;
        }
        return false;
      };
      if (Array.isArray(node.comments) && updateComment(node.comments)) mark();
    }
  } catch (err) {
    log.error("Failed __updateComment:", err);
  }

  try {
    // 5) Delete a comment or reply
    if (u.__deleteComment) {
      const targetId = toStr(u.__deleteComment);
      const deleteComment = (comments) =>
        comments
          .map((c) => {
            if (toStr(c?._id) === targetId) return null;
            if (Array.isArray(c?.replies)) c.replies = deleteComment(c.replies);
            return c;
          })
          .filter(Boolean);

      if (Array.isArray(node.comments)) {
        const before = node.comments.length;
        node.comments = deleteComment(node.comments);
        if (node.comments.length !== before) mark();
      }
    }
  } catch (err) {
    log.error("Failed __deleteComment:", err);
  }

  try {
    // 6) Update likes on a comment or a reply
    if (u.__updateCommentLikes) {
      const { commentId: topId, replyId, likes = [] } = u.__updateCommentLikes;

      const updateReplyLikesDeep = (nodes) => {
        let changed = false;
        const next = (nodes || []).map((n) => {
          if (!n || typeof n !== "object") return n;
          if (replyId && toStr(n._id) === toStr(replyId)) {
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

      if (replyId) {
        const idx = (node.comments || []).findIndex((c) => toStr(c?._id) === toStr(topId));
        if (idx !== -1) {
          const top = node.comments[idx];
          const { next: newReplies, changed } = updateReplyLikesDeep(top?.replies || []);
          if (changed) {
            node.comments[idx] = { ...top, replies: newReplies };
            mark();
          }
        } else {
          const { next: newComments, changed } = updateReplyLikesDeep(node.comments || []);
          if (changed) { node.comments = newComments; mark(); }
        }
      } else {
        const mapped = (node.comments || []).map((c) =>
          toStr(c?._id) === toStr(topId) ? { ...c, likes } : c
        );
        if (mapped !== node.comments) { node.comments = mapped; mark(); }
      }
    }
  } catch (err) {
    log.error("Failed __updateCommentLikes:", err);
  }

  try {
    // 7) Merge any plain fields (non __-keys)
    const plainEntries = Object.entries(u).filter(([k]) => !k.startsWith("__"));
    if (plainEntries.length) {
      Object.assign(node, Object.fromEntries(plainEntries));
      mark();
    }
  } catch (err) {
    log.error("Failed merging plain fields:", err);
  }

  return mutated;
};

export const updateNearbySuggestions = ({
  state,                 // draft of root state OR the GooglePlaces slice draft
  postId,
  updates = {},
  debug = false,
  label = "updateNearbyCollections",
  alsoMatchSharedOriginal = true,   // NEW: update SharedPost.original if ids match
}) => {
  const G = state?.GooglePlaces || state; // support root draft or slice draft
  const listKey = "nearbySuggestions";

  const log = {
    info: (...a) => debug && console.info(`[${label}]`, ...a),
    warn: (...a) => debug && console.warn(`[${label}]`, ...a),
    error: (...a) => debug && console.error(`[${label}]`, ...a),
  };

  const pid = toStr(postId);

  const tryApplyToItem = (item) => {
    if (!item) return false;

    // exact match on the wrapper
    if (getId(item) === pid) {
      return applyCustomUpdateToNode(item, updates, log);
    }

    // match to a shared original
    if (alsoMatchSharedOriginal && isSharedPost(item) && getOriginalId(item) === pid && item.original) {
      const changed = applyCustomUpdateToNode(item.original, updates, log);
      if (changed) item.original = { ...item.original }; // bump identity
      return changed;
    }

    return false;
  };

  try {
    // list
    const list = G?.[listKey];
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        if (tryApplyToItem(list[i])) {
          // bump identity for Immer/react re-render
          list[i] = { ...list[i] };
          break; // assume unique id
        }
      }
    }

    // selectedSuggestion
    if (G?.selectedSuggestion) {
      const sel = G.selectedSuggestion;
      if (tryApplyToItem(sel)) {
        G.selectedSuggestion = { ...G.selectedSuggestion };
      }
    }
  } catch (outerErr) {
    log.error("Unhandled error in updateNearbyCollections:", outerErr);
  }
};
