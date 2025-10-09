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
  debug = true,             // ⬅️ set to false to silence logs
  label = 'updatePostCollections'
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

  const applyCustomUpdate = (post) => {
    if (!post) {
      log.warn('applyCustomUpdate called with falsy post');
      return;
    }

    log.group(`Applying updates to post ${post._id || '(no _id)'} ...`);
    log.info('incoming updates keys:', Object.keys(updates));

    const u = updates || {};

    try {
      // 6) Update likes on the post itself
      if (u.__updatePostLikes) {
        const val = u.__updatePostLikes;
        if (Array.isArray(val)) {
          // legacy shape: __updatePostLikes = [ ...likes ]
          const before = Array.isArray(post.likes) ? post.likes.length : 0;
          post.likes = val;
          log.info(`__updatePostLikes[array] -> ${before} -> ${post.likes?.length ?? 0}`);
        } else if (val && typeof val === 'object') {
          // new shape: __updatePostLikes = { likes, likesCount?, liked? }
          const before = Array.isArray(post.likes) ? post.likes.length : 0;
          if (Array.isArray(val.likes)) post.likes = val.likes;
          if (typeof val.likesCount === 'number') post.likesCount = val.likesCount;
          if (typeof val.liked === 'boolean') post.liked = val.liked;
          log.info(
            `__updatePostLikes[obj] -> ${before} -> ${post.likes?.length ?? 0}` +
            (val.likesCount !== undefined ? `, likesCount=${val.likesCount}` : '') +
            (val.liked !== undefined ? `, liked=${val.liked}` : '')
          );
        } else {
          log.warn('__updatePostLikes has unsupported type:', typeof val);
        }
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
      // 1) Append a reply to a specific comment
      if (u.__appendReply) {
        const { commentId, reply } = u.__appendReply;
        let inserted = false;

        const insertReply = (comments) => {
          for (const c of comments) {
            if (!c || typeof c !== 'object') continue;
            if (c._id === commentId) {
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
            if (c._id === commentId) {
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
              if (c._id === targetId) {
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
      // 4) Update likes on a comment or reply (immutable rebuild so lists re-render)
      if (u.__updateCommentLikes) {
        const { commentId: topId, replyId, likes = [] } = u.__updateCommentLikes;

        // Immutable helpers
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

        if (!Array.isArray(post.comments)) {
          log.warn('__updateCommentLikes skipped: post.comments is not an array');
        } else if (replyId) {
          // Try to scope to the top-level subtree first
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
              log.warn(`__updateCommentLikes (reply) -> no change under topId=${topId}; replyId=${replyId} not found`);
            }
          } else {
            // Fallback: rebuild entire comments tree
            const { next: newComments, changed } = updateReplyLikesDeep(post.comments || []);
            if (changed) {
              post.comments = newComments;
              log.info(`__updateCommentLikes (reply) -> updated via full-tree scan, replyId=${replyId}, likes=${likes.length}`);
            } else {
              log.warn(`__updateCommentLikes (reply) -> replyId=${replyId} not found in full-tree scan`);
            }
          }
        } else {
          // Top-level like: replace that comment object, and comments array
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



    // At the top of applyCustomUpdate(post)
    try {
      const postLevelBefore = Array.isArray(post.taggedUsers) ? post.taggedUsers.length : null;
      const photosBefore = Array.isArray(post.photos) ? post.photos.length : 0;
      const totalPhotoTagsBefore = (post.photos || []).reduce(
        (sum, p) => sum + (Array.isArray(p?.taggedUsers) ? p.taggedUsers.length : 0),
        0
      );
      log.info('pre-state', {
        postId: String(post?._id || ''),
        postLevelBefore,
        photosBefore,
        totalPhotoTagsBefore,
        // optional small preview
        photoPreview: (post.photos || []).slice(0, 5).map(p => ({
          _id: String(p?._id || ''),
          photoKey: String(p?.photoKey || ''),
          tagCount: Array.isArray(p?.taggedUsers) ? p.taggedUsers.length : 0,
        })),
      });
    } catch (e) {
      log.warn('pre-state logging failed', e?.message);
    }

    /* ---------- A) remove from post-level ---------- */
    try {
      if (u.__removeSelfFromPost) {
        const { userId } = u.__removeSelfFromPost;
        const before = Array.isArray(post.taggedUsers) ? post.taggedUsers.length : null;

        if (Array.isArray(post.taggedUsers)) {
          const { next, removed } = removeIdFromIdArray(post.taggedUsers, userId);
          post.taggedUsers = next;
          const after = post.taggedUsers.length;
          log.info(`__removeSelfFromPost`, {
            userId: String(userId),
            removed,
            before,
            after,
          });
        } else {
          log.warn('__removeSelfFromPost skipped: post.taggedUsers is not an array', {
            typeofTaggedUsers: typeof post.taggedUsers,
          });
        }
      }
    } catch (err) {
      log.error('Failed __removeSelfFromPost:', err, '\ncontext:', safeStringify(u.__removeSelfFromPost));
    }

    /* ---------- B) remove from ALL photos ---------- */
    try {
      if (u.__removeSelfFromAllPhotos) {
        const { userId } = u.__removeSelfFromAllPhotos;
        let removedTotal = 0;
        const perPhoto = [];

        if (Array.isArray(post.photos)) {
          post.photos.forEach((p, idx) => {
            const before = Array.isArray(p?.taggedUsers) ? p.taggedUsers.length : 0;
            const removed = removeUserFromPhotoTags(p, userId);
            const after = Array.isArray(p?.taggedUsers) ? p.taggedUsers.length : 0;
            if (removed > 0) {
              perPhoto.push({
                idx,
                photoId: String(p?._id || ''),
                photoKey: String(p?.photoKey || ''),
                removed,
                before,
                after,
              });
            }
            removedTotal += removed;
          });

          log.info(`__removeSelfFromAllPhotos`, {
            userId: String(userId),
            removedTotal,
            changedPhotos: perPhoto.length,
            details: perPhoto.slice(0, 10), // cap to avoid noisy logs
          });
        } else {
          log.warn('__removeSelfFromAllPhotos skipped: post.photos is not an array', {
            typeofPhotos: typeof post.photos,
          });
        }
      }
    } catch (err) {
      log.error('Failed __removeSelfFromAllPhotos:', err, '\ncontext:', safeStringify(u.__removeSelfFromAllPhotos));
    }

    /* ---------- C) remove from ONE photo ---------- */
    try {
      if (u.__removeSelfFromPhoto) {
        const { userId, photoId } = u.__removeSelfFromPhoto;

        if (Array.isArray(post.photos)) {
          const pid = toStr(photoId);
          const photoIdx = post.photos.findIndex(
            (p) => toStr(p._id) === pid || toStr(p.photoId) === pid || toStr(p.photoKey) === pid
          );

          if (photoIdx === -1) {
            log.warn(`__removeSelfFromPhoto -> photo not found`, {
              photoIdTried: pid,
              available: post.photos.slice(0, 10).map((p, i) => ({
                i,
                _id: toStr(p._id),
                photoId: toStr(p.photoId),
                photoKey: toStr(p.photoKey),
                tagCount: Array.isArray(p?.taggedUsers) ? p.taggedUsers.length : 0,
              })),
            });
          } else {
            const target = post.photos[photoIdx];
            const before = Array.isArray(target?.taggedUsers) ? target.taggedUsers.length : 0;
            const removed = removeUserFromPhotoTags(target, userId);
            const after = Array.isArray(target?.taggedUsers) ? target.taggedUsers.length : 0;

            log.info(`__removeSelfFromPhoto`, {
              userId: String(userId),
              photoIdx,
              photoMatch: {
                _id: toStr(target?._id),
                photoId: toStr(target?.photoId),
                photoKey: toStr(target?.photoKey),
              },
              removed,
              before,
              after,
            });
          }
        } else {
          log.warn('__removeSelfFromPhoto skipped: post.photos is not an array', {
            typeofPhotos: typeof post.photos,
          });
        }
      }
    } catch (err) {
      log.error('Failed __removeSelfFromPhoto:', err, '\ncontext:', safeStringify(u.__removeSelfFromPhoto));
    }

    /* ---------- final snapshot ---------- */
    try {
      const postLevelAfter = Array.isArray(post.taggedUsers) ? post.taggedUsers.length : null;
      const totalPhotoTagsAfter = (post.photos || []).reduce(
        (sum, p) => sum + (Array.isArray(p?.taggedUsers) ? p.taggedUsers.length : 0),
        0
      );
      log.info('post-state', {
        postId: String(post?._id || ''),
        postLevelAfter,
        totalPhotoTagsAfter,
      });
    } catch (e) {
      log.warn('post-state logging failed', e?.message);
    }

    try {
      // 5) Shallow-merge any other fields (excluding the __-prefixed control keys)
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
  //////////////////

  try {
    // Apply to lists that contain the post
    for (const key of postKeys || []) {
      try {
        const list = state?.[key];
        if (!Array.isArray(list)) {
          log.warn(`State key "${key}" is not an array; skipping.`);
          continue;
        }
        const idx = list.findIndex((p) => String(p?._id) === String(postId));
        if (idx === -1) {
          log.warn(`Post ${postId} not found in list "${key}"`);
          continue;
        }
        log.group(`Updating list "${key}" at index ${idx}`);
        applyCustomUpdate(list[idx]);
        log.groupEnd();
      } catch (err) {
        log.error(`Error while updating list "${key}"`, err);
      }
    }

    // Apply to selectedReview / selectedPost if it matches
    let sel = null;
    if (state?.selectedPost?._id === postId) {
      sel = state.selectedPost;
      log.info('selectedPost matches postId; applying updates.');
    } else if (state?.selectedReview?._id === postId) {
      sel = state.selectedReview;
      log.info('selectedReview matches postId; applying updates.');
    }

    if (sel) {
      try {
        applyCustomUpdate(sel);
      } catch (err) {
        log.error('Failed applying updates to selected item:', err);
      }
    }
  } catch (outerErr) {
    log.error('Unhandled error in updatePostCollections root:', outerErr, '\nstate keys:', Object.keys(state || {}));
  } finally {
    const ms = Date.now() - start;
    log.info(`Done postId=${postId} in ${ms}ms`);
  }
};
