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

export const updateNearbySuggestions = ({
  state,                 // draft of root state OR the GooglePlaces slice draft
  postId,
  updates = {},
  debug = true,
  label = 'updateNearbyCollections',
}) => {
  const start = Date.now();
  const stamp = () => new Date().toISOString();

  const log = {
    info: (...a) => debug && console.info(`[${stamp()}] [${label}]`, ...a),
    warn: (...a) => debug && console.warn(`[${stamp()}] [${label}]`, ...a),
    error: (...a) => debug && console.error(`[${stamp()}] [${label}]`, ...a),
    group: (title) => debug && console.groupCollapsed(`[${stamp()}] [${label}] ${title}`),
    groupEnd: () => debug && console.groupEnd(),
  };

  const G = state?.GooglePlaces || state; // support root draft or slice draft
  const listKey = 'nearbySuggestions';

  const applyCustomUpdate = (post) => {
    if (!post) {
      log.warn('applyCustomUpdate called with falsy post');
      return;
    }

    log.group(`Applying updates to nearby post ${post._id || '(no _id)'} ...`);
    log.info('incoming updates keys:', Object.keys(updates));
    const u = updates || {};

    try {
      // 6) Update likes on the post itself
      if (u.__updatePostLikes) {
        const before = Array.isArray(post.likes) ? post.likes.length : 0;
        post.likes = u.__updatePostLikes;
        log.info(`__updatePostLikes -> ${before} -> ${post.likes?.length ?? 0}`);
      }
    } catch (err) {
      log.error('Failed __updatePostLikes:', err, '\ncontext:', safeStringify({ likes: u.__updatePostLikes }));
    }

    try {
      // 0) Append a top-level comment
      if (u.__appendComment) {
        const before = (post.comments || []).length;
        post.comments = [...(post.comments || []), u.__appendComment];
        log.info(`__appendComment -> ${before} -> ${post.comments.length}`, '\ncomment:', safeStringify(u.__appendComment));
      }
    } catch (err) {
      log.error('Failed __appendComment:', err, '\ncontext:', safeStringify({ appendComment: u.__appendComment }));
    }

    try {
      // 1) Append a reply
      if (u.__appendReply) {
        const { commentId, reply } = u.__appendReply;
        let inserted = false;

        const insertReply = (comments) => {
          for (const c of comments) {
            if (!c || typeof c !== 'object') continue;
            if (String(c._id) === String(commentId)) {
              const before = (c.replies || []).length;
              c.replies = [...(c.replies || []), reply];
              inserted = true;
              log.info(`__appendReply -> inserted under comment ${commentId} (${before} -> ${c.replies.length})`);
              return true;
            }
            if (Array.isArray(c.replies) && insertReply(c.replies)) return true;
          }
          return false;
        };

        if (Array.isArray(post.comments)) {
          insertReply(post.comments);
        } else {
          log.warn('__appendReply skipped: post.comments is not an array');
        }

        if (!inserted) {
          log.warn(`__appendReply could not find target commentId=${commentId}`);
        }
      }
    } catch (err) {
      log.error('Failed __appendReply:', err, '\ncontext:', safeStringify(u.__appendReply));
    }

    try {
      // 2) Update a comment or reply
      if (u.__updateComment) {
        const { commentId, updatedComment = {} } = u.__updateComment;
        let updated = false;

        const updateComment = (comments) => {
          for (const c of comments) {
            if (!c || typeof c !== 'object') continue;
            if (String(c._id) === String(commentId)) {
              Object.assign(c, updatedComment || {});
              updated = true;
              log.info(`__updateComment -> updated commentId=${commentId}`, '\npatch:', safeStringify(updatedComment));
              return true;
            }
            if (Array.isArray(c.replies) && updateComment(c.replies)) return true;
          }
          return false;
        };

        if (Array.isArray(post.comments)) {
          updateComment(post.comments);
        } else {
          log.warn('__updateComment skipped: post.comments is not an array');
        }

        if (!updated) {
          log.warn(`__updateComment could not find commentId=${commentId}`);
        }
      }
    } catch (err) {
      log.error('Failed __updateComment:', err, '\ncontext:', safeStringify(u.__updateComment));
    }

    try {
      // 3) Delete a comment or reply
      if (u.__deleteComment) {
        const targetId = u.__deleteComment;
        let removed = false;

        const deleteComment = (comments) =>
          comments
            .map((c) => {
              if (!c || typeof c !== 'object') return c;
              if (String(c._id) === String(targetId)) {
                removed = true;
                return null;
              }
              if (Array.isArray(c.replies)) c.replies = deleteComment(c.replies);
              return c;
            })
            .filter(Boolean);

        if (Array.isArray(post.comments)) {
          const before = post.comments.length;
          post.comments = deleteComment(post.comments);
          const after = post.comments.length;
          log.info(`__deleteComment -> ${before} -> ${after} (removed=${removed})`, `targetId=${targetId}`);
          if (!removed) log.warn(`__deleteComment could not find targetId=${targetId}`);
        } else {
          log.warn('__deleteComment skipped: post.comments is not an array');
        }
      }
    } catch (err) {
      log.error('Failed __deleteComment:', err, '\ncontext:', safeStringify({ targetId: u.__deleteComment }));
    }

    try {
      // 4) Update likes on a comment or reply (immutable array identities)
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

        if (!Array.isArray(post.comments)) {
          log.warn('__updateCommentLikes skipped: post.comments is not an array');
        } else if (replyId) {
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
              log.info(`__updateCommentLikes (reply) -> updated under topId=${topId}, replyId=${replyId}, likes=${likes.length}`);
            } else {
              log.warn(`__updateCommentLikes (reply) -> not found under topId=${topId}, replyId=${replyId}`);
            }
          } else {
            const { next: newComments, changed } = updateReplyLikesDeep(post.comments || []);
            if (changed) {
              post.comments = newComments;
              log.info(`__updateCommentLikes (reply) -> updated via full-tree scan, replyId=${replyId}, likes=${likes.length}`);
            } else {
              log.warn(`__updateCommentLikes (reply) -> replyId=${replyId} not found`);
            }
          }
        } else {
          const beforeHits = (post.comments || []).filter((c) => String(c._id) === String(topId)).length;
          post.comments = (post.comments || []).map((c) =>
            String(c._id) === String(topId) ? { ...c, likes } : c
          );
          const afterHits = (post.comments || []).filter((c) => String(c._id) === String(topId)).length;
          if (afterHits > 0) {
            log.info(`__updateCommentLikes (top-level) -> updated commentId=${topId}, likes=${likes.length}`);
          } else {
            log.warn(`__updateCommentLikes (top-level) -> commentId=${topId} not found (beforeHits=${beforeHits})`);
          }
        }
      }
    } catch (err) {
      log.error('Failed __updateCommentLikes:', err, '\ncontext:', safeStringify(u.__updateCommentLikes));
    }

    try {
      // 5) Shallow-merge any plain fields (non __-keys)
      const plainEntries = Object.entries(u).filter(([k]) => !k.startsWith('__'));
      if (plainEntries.length) {
        Object.assign(post, Object.fromEntries(plainEntries));
        log.info('Merged plain fields:', plainEntries.map(([k]) => k));
      }
    } catch (err) {
      log.error('Failed merging plain fields:', err, '\ncontext:', safeStringify(u));
    }

    log.groupEnd();
  };

  try {
    const list = G?.[listKey];
    if (!Array.isArray(list)) {
      log.warn(`State key "${listKey}" is not an array; skipping.`);
    } else {
      const idx = list.findIndex((p) => String(p?._id) === String(postId));
      if (idx === -1) {
        log.warn(`Post ${postId} not found in list "${listKey}"`);
      } else {
        log.group(`Updating list "${listKey}" at index ${idx}`);
        applyCustomUpdate(list[idx]);
        log.groupEnd();
      }
    }

    // Optional: if you later keep a focused object for details
    const sel =
      G?.selectedSuggestion && String(G.selectedSuggestion?._id) === String(postId)
        ? G.selectedSuggestion
        : null;

    if (sel) {
      try {
        log.info('selectedSuggestion matches postId; applying updates.');
        applyCustomUpdate(sel);
      } catch (err) {
        log.error('Failed applying updates to selectedSuggestion:', err);
      }
    }
  } catch (outerErr) {
    log.error(
      'Unhandled error in updateNearbyCollections root:',
      outerErr,
      '\nstate keys:',
      Object.keys(G || {})
    );
  } finally {
    const ms = Date.now() - start;
    log.info(`Done postId=${postId} in ${ms}ms`);
  }
};
