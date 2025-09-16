const safeStringify = (obj) => {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    },
    2
  );
};

export const updateNearbySuggestions = ({
  state,                 // draft of root state OR the GooglePlaces slice draft
  postId,
  updates = {},
  debug = false,         // default to false now
  label = "updateNearbyCollections",
}) => {
  const G = state?.GooglePlaces || state; // support root draft or slice draft
  const listKey = "nearbySuggestions";

  const log = {
    info: (...a) => debug && console.info(`[${label}]`, ...a),
    warn: (...a) => debug && console.warn(`[${label}]`, ...a),
    error: (...a) => debug && console.error(`[${label}]`, ...a),
  };

  const applyCustomUpdate = (post) => {
    if (!post) return;

    const u = updates || {};

    try {
      // 1) Update likes on the post itself
      if (u.__updatePostLikes) {
        post.likes = u.__updatePostLikes.likes;
      }
    } catch (err) {
      log.error("Failed __updatePostLikes:", err, safeStringify({ likes: u.__updatePostLikes }));
    }

    try {
      // 2) Append a top-level comment
      if (u.__appendComment) {
        post.comments = [...(post.comments || []), u.__appendComment];
      }
    } catch (err) {
      log.error("Failed __appendComment:", err, safeStringify({ appendComment: u.__appendComment }));
    }

    try {
      // 3) Append a reply
      if (u.__appendReply) {
        const { commentId, reply } = u.__appendReply;
        const insertReply = (comments) => {
          for (const c of comments) {
            if (String(c?._id) === String(commentId)) {
              c.replies = [...(c.replies || []), reply];
              return true;
            }
            if (Array.isArray(c?.replies) && insertReply(c.replies)) return true;
          }
          return false;
        };
        if (Array.isArray(post.comments)) insertReply(post.comments);
      }
    } catch (err) {
      log.error("Failed __appendReply:", err, safeStringify(u.__appendReply));
    }

    try {
      // 4) Update a comment or reply
      if (u.__updateComment) {
        const { commentId, updatedComment = {} } = u.__updateComment;
        const updateComment = (comments) => {
          for (const c of comments) {
            if (String(c?._id) === String(commentId)) {
              Object.assign(c, updatedComment || {});
              return true;
            }
            if (Array.isArray(c?.replies) && updateComment(c.replies)) return true;
          }
          return false;
        };
        if (Array.isArray(post.comments)) updateComment(post.comments);
      }
    } catch (err) {
      log.error("Failed __updateComment:", err, safeStringify(u.__updateComment));
    }

    try {
      // 5) Delete a comment or reply
      if (u.__deleteComment) {
        const targetId = u.__deleteComment;
        const deleteComment = (comments) =>
          comments
            .map((c) => {
              if (String(c?._id) === String(targetId)) return null;
              if (Array.isArray(c?.replies)) c.replies = deleteComment(c.replies);
              return c;
            })
            .filter(Boolean);
        if (Array.isArray(post.comments)) {
          post.comments = deleteComment(post.comments);
        }
      }
    } catch (err) {
      log.error("Failed __deleteComment:", err, safeStringify({ targetId: u.__deleteComment }));
    }

    try {
      // 6) Update likes on a comment or reply
      if (u.__updateCommentLikes) {
        const { commentId: topId, replyId, likes = [] } = u.__updateCommentLikes;

        const updateReplyLikesDeep = (nodes) => {
          let changed = false;
          const next = (nodes || []).map((n) => {
            if (!n || typeof n !== "object") return n;
            if (replyId && String(n._id) === String(replyId)) {
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
          const idx = (post.comments || []).findIndex((c) => String(c?._id) === String(topId));
          if (idx !== -1) {
            const top = post.comments[idx];
            const { next: newReplies, changed } = updateReplyLikesDeep(top?.replies || []);
            if (changed) {
              post.comments[idx] = { ...top, replies: newReplies };
            }
          }
        } else {
          post.comments = (post.comments || []).map((c) =>
            String(c?._id) === String(topId) ? { ...c, likes } : c
          );
        }
      }
    } catch (err) {
      log.error("Failed __updateCommentLikes:", err, safeStringify(u.__updateCommentLikes));
    }

    try {
      // 7) Shallow-merge any plain fields (non __-keys)
      const plainEntries = Object.entries(u).filter(([k]) => !k.startsWith("__"));
      if (plainEntries.length) {
        Object.assign(post, Object.fromEntries(plainEntries));
      }
    } catch (err) {
      log.error("Failed merging plain fields:", err, safeStringify(u));
    }
  };

  try {
    const list = G?.[listKey];
    if (Array.isArray(list)) {
      const idx = list.findIndex((p) => String(p?._id) === String(postId));
      if (idx !== -1) {
        applyCustomUpdate(list[idx]);
      }
    }
    const sel =
      G?.selectedSuggestion && String(G.selectedSuggestion?._id) === String(postId)
        ? G.selectedSuggestion
        : null;
    if (sel) applyCustomUpdate(sel);
  } catch (outerErr) {
    log.error("Unhandled error in updateNearbyCollections root:", outerErr, Object.keys(G || {}));
  }
};
