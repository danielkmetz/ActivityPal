const TAG = '[updateTaggedPostCollections]';
const DEBUG = false;
const dlog = (...args) => {
  if (DEBUG) console.log(TAG, ...args);
};

const toStr = (v) => (v == null ? '' : String(v));
const getId = (x) => toStr(x?._id ?? x?.id);

const isSharedPost = (p) => {
  const t = p?.type || p?.postType || p?.canonicalType;
  return t === 'sharedPost' || t === 'sharedPosts';
};

const getOriginalId = (p) => (isSharedPost(p) ? getId(p.original) : '');

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

// Hidden-tag wrapper -> inner post
const getInnerPost = (wrapper) =>
  wrapper?.post ||
  wrapper?.review ||
  wrapper?.checkIn ||
  wrapper?.sharedPost ||
  wrapper?.live ||
  null;

// Keep wrapper in sync when we mutate its original
const mirrorOriginalToWrapper = (wrapper) => {
  if (!wrapper || !wrapper.original) return;
  if (Array.isArray(wrapper.original.comments)) {
    wrapper.comments = wrapper.original.comments;
  }
  const count = wrapper?.original?.comments?.length ?? 0;
  if (wrapper?.stats && typeof wrapper.stats.commentCount === 'number') {
    wrapper.stats = { ...wrapper.stats, commentCount: count };
  } else if ('commentCount' in (wrapper || {})) {
    wrapper.commentCount = count;
  }
};

/**
 * Apply post-level updates to the taggedPosts slice state.
 *
 * Mirrors updatePostCollections, but walks:
 *   - state.byUser[uid].items
 *   - optionally state.hidden.items (hidden tagged posts)
 *
 * @param {Object} params
 * @param {Object} params.state   - taggedPosts slice state (NOT root state)
 * @param {string|Object} params.postId - post id or something coercible to string
 * @param {Object} params.updates - update descriptor (__updatePostLikes, __appendComment, etc.)
 * @param {boolean} [params.alsoMatchSharedOriginal=true] - also match shared wrappers whose original is postId
 * @param {boolean} [params.includeHidden=true] - whether to update hidden.items as well
 * @param {string[]|null} [params.limitToUserIds=null] - optional list of userIds to limit byUser iteration
 */
export const updateTaggedPostCollections = ({
  state,
  postId,
  updates = {},
  alsoMatchSharedOriginal = true,
  includeHidden = true,
  limitToUserIds = null,
}) => {
  if (!state) return;

  const postIdStr = toStr(postId);
  if (!postIdStr) return;

  const u = updates || {};

  // ----- core mutator for a single node (original or standalone post) -----
  const applyCustomUpdateToNode = (node) => {
    if (!node) return false;

    let mutated = false;
    const mark = () => { mutated = true; };

    // A) post likes
    if (u.__updatePostLikes) {
      const val = u.__updatePostLikes;
      if (Array.isArray(val)) {
        node.likes = val;
        mark();
      } else if (val && typeof val === 'object') {
        if (Array.isArray(val.likes)) {
          node.likes = val.likes;
          mark();
        }
        if (typeof val.likesCount === 'number') {
          node.likesCount = val.likesCount;
          mark();
        }
        if (typeof val.liked === 'boolean') {
          node.liked = val.liked;
          mark();
        }
      }
    }

    // B) append top-level comment
    if (u.__appendComment) {
      node.comments = [...(node.comments || []), u.__appendComment];
      mark();
    }

    // C) append reply
    if (u.__appendReply) {
      const { commentId, reply } = u.__appendReply;
      const insertReply = (comments) => {
        for (const c of comments) {
          if (!c || typeof c !== 'object') continue;
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

    // D) update comment/reply
    if (u.__updateComment) {
      const { commentId, updatedComment = {} } = u.__updateComment;
      const updateComment = (comments) => {
        for (const c of comments) {
          if (!c || typeof c !== 'object') continue;
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

    // E) delete comment/reply
    if (u.__deleteComment) {
      const targetId = toStr(u.__deleteComment);
      const deleteComment = (comments) =>
        comments
          .map((c) => {
            if (!c || typeof c !== 'object') return c;
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

    // F) update likes on comment/reply
    if (u.__updateCommentLikes) {
      const { commentId: topId, replyId, likes = [] } = u.__updateCommentLikes;
      const updateReplyLikesDeep = (nodes) => {
        let changed = false;
        const next = (nodes || []).map((n) => {
          if (!n || typeof n !== 'object') return n;
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

    // G) remove self from post-level tags
    if (u.__removeSelfFromPost) {
      const { userId } = u.__removeSelfFromPost;
      const maybeStrip = (field) => {
        if (!Array.isArray(node[field])) return;
        const { next, removed } = removeUserFromTagArray(node[field], userId);
        if (removed > 0) {
          node[field] = next;
          mark();
        }
      };
      maybeStrip('taggedUsers');
      maybeStrip('tags');
      maybeStrip('peopleTagged');
    }

    // H) remove self from all photos
    if (u.__removeSelfFromAllPhotos) {
      const { userId } = u.__removeSelfFromAllPhotos;
      const media = node.media || node.photos;
      if (Array.isArray(media)) {
        let removedAny = 0;
        media.forEach((p) => {
          removedAny += removeUserFromPhotoTags(p, userId);
        });
        if (removedAny > 0) mark();
      }
    }

    // I) remove self from one photo
    if (u.__removeSelfFromPhoto) {
      const { userId, photoId } = u.__removeSelfFromPhoto;
      const media = node.media || node.photos;
      if (Array.isArray(media)) {
        const pid = toStr(photoId);
        const idx = media.findIndex(
          (p) => [p?._id, p?.id, p?.photoId, p?.photoKey].map(toStr).includes(pid)
        );
        if (idx !== -1) {
          const target = media[idx];
          if (removeUserFromPhotoTags(target, userId) > 0) mark();
        }
      }
    }

    // J) merge plain fields
    const plainEntries = Object.entries(u).filter(([k]) => !k.startsWith('__'));
    if (plainEntries.length) {
      Object.assign(node, Object.fromEntries(plainEntries));
      mark();
    }

    return mutated;
  };

  const isCommentOp = Object.keys(u).some(
    (k) =>
      k === '__appendComment' ||
      k === '__appendReply' ||
      k === '__updateComment' ||
      k === '__deleteComment' ||
      k === '__updateCommentLikes'
  );

  // ------------ build list descriptors from taggedPosts slice ------------
  const lists = [];

  // All user-tagged feeds
  const byUser = state.byUser || {};
  const limitSet =
    Array.isArray(limitToUserIds) && limitToUserIds.length
      ? new Set(limitToUserIds.map(toStr))
      : null;

  for (const [uid, feed] of Object.entries(byUser)) {
    if (limitSet && !limitSet.has(toStr(uid))) continue;
    if (!feed || !Array.isArray(feed.items) || feed.items.length === 0) continue;

    lists.push({
      kind: 'feed',
      uid,
      list: feed.items,
    });
  }

  // Hidden tagged posts, if requested
  if (includeHidden && state.hidden && Array.isArray(state.hidden.items) && state.hidden.items.length) {
    lists.push({
      kind: 'hidden',
      list: state.hidden.items,
    });
  }

  if (!lists.length) {
    dlog('No tagged lists to update for postId', postIdStr);
    return;
  }

  // ---------------------- apply updates to each list ----------------------
  for (const src of lists) {
    const { kind, list } = src;
    if (!Array.isArray(list) || list.length === 0) continue;

    const changedIdx = new Set();

    if (kind === 'hidden') {
      // Hidden-tag wrappers: update inner post
      for (let i = 0; i < list.length; i++) {
        const wrapper = list[i];
        if (!wrapper) continue;

        const postNode = getInnerPost(wrapper) || wrapper;

        if (getId(postNode) === postIdStr) {
          let changed = false;
          if (isSharedPost(postNode) && postNode.original && isCommentOp) {
            changed = applyCustomUpdateToNode(postNode.original);
            if (changed) {
              postNode.original = { ...postNode.original };
            }
          } else {
            changed = applyCustomUpdateToNode(postNode);
          }
          if (changed) changedIdx.add(i);
        }
      }

      if (alsoMatchSharedOriginal) {
        for (let i = 0; i < list.length; i++) {
          const wrapper = list[i];
          if (!wrapper) continue;

          const postNode = getInnerPost(wrapper) || wrapper;
          if (!isSharedPost(postNode)) continue;

          const matchesOriginal =
            getOriginalId(postNode) === postIdStr ||
            toStr(postNode.originalPostId) === postIdStr;

          if (!matchesOriginal) continue;

          if (!postNode.original) {
            postNode.original = { _id: postIdStr, comments: [] };
          }

          const changed = applyCustomUpdateToNode(postNode.original);
          if (changed) {
            postNode.original = { ...postNode.original };
            changedIdx.add(i);
          }
        }
      }

      // bump wrapper identity for changed items
      for (const i of changedIdx) {
        list[i] = { ...list[i] };
      }
    } else {
      // Normal tagged feeds: items are posts (including sharedPost wrappers)
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item) continue;

        if (getId(item) === postIdStr) {
          let changed = false;

          if (isSharedPost(item) && item.original && isCommentOp) {
            changed = applyCustomUpdateToNode(item.original);
            if (changed) {
              item.original = { ...item.original };
              mirrorOriginalToWrapper(item);
            }
          } else {
            changed = applyCustomUpdateToNode(item);
          }

          if (changed) changedIdx.add(i);
        }
      }

      if (alsoMatchSharedOriginal) {
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          if (!item || !isSharedPost(item)) continue;

          const matchesOriginal =
            getOriginalId(item) === postIdStr ||
            toStr(item.originalPostId) === postIdStr;

          if (!matchesOriginal) continue;

          if (!item.original) {
            item.original = { _id: postIdStr, comments: [] };
          }

          const changed = applyCustomUpdateToNode(item.original);
          if (changed) {
            item.original = { ...item.original };
            mirrorOriginalToWrapper(item);
            changedIdx.add(i);
          }
        }
      }

      // bump identity for changed items
      for (const i of changedIdx) {
        list[i] = { ...list[i] };
      }
    }
  }
};
