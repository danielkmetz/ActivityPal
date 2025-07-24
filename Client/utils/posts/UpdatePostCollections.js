export const updatePostCollections = ({ state, postId, updates, postKeys = [] }) => {
  const applyCustomUpdate = (post) => {
    if (!post) return;

    // 6. Update likes on the post itself
    if (updates.__updatePostLikes) {
      post.likes = updates.__updatePostLikes;
    }

    // 0. Append a top-level comment
    if (updates.__appendComment) {
      post.comments = [...(post.comments || []), updates.__appendComment];
    }

    // 1. Append a reply to a specific comment
    if (updates.__appendReply) {
      const { commentId, reply } = updates.__appendReply;

      const insertReply = (comments) => {
        for (const c of comments) {
          if (c._id === commentId) {
            c.replies = [...(c.replies || []), reply];
            return true;
          }
          if (c.replies && insertReply(c.replies)) return true;
        }
        return false;
      };

      if (post.comments) insertReply(post.comments);
    }

    // 2. Update a comment or reply
    if (updates.__updateComment) {
      const { commentId, updatedComment } = updates.__updateComment;

      const updateComment = (comments) => {
        for (const c of comments) {
          if (c._id === commentId) {
            Object.assign(c, updatedComment);
            return true;
          }
          if (c.replies && updateComment(c.replies)) return true;
        }
        return false;
      };

      if (post.comments) updateComment(post.comments);
    }

    // 3. Delete a comment or reply
    if (updates.__deleteComment) {
      const targetId = updates.__deleteComment;

      const deleteComment = (comments) =>
        comments
          .map((c) => {
            if (c._id === targetId) return null;
            if (c.replies) c.replies = deleteComment(c.replies);
            return c;
          })
          .filter(Boolean);

      if (post.comments) {
        post.comments = deleteComment(post.comments);
      }
    }

    // 4. Update likes on a comment or reply
    if (updates.__updateCommentLikes) {
      const { commentId, replyId, likes } = updates.__updateCommentLikes;

      const updateLikes = (comments) => {
        for (const c of comments) {
          if (replyId && c._id === commentId) {
            const reply = (c.replies || []).find(r => r._id === replyId);
            if (reply) {
              reply.likes = likes;
              return true;
            }
          } else if (!replyId && c._id === commentId) {
            c.likes = likes;
            return true;
          }

          if (c.replies && updateLikes(c.replies)) return true;
        }
        return false;
      };

      if (post.comments) updateLikes(post.comments);
    }

    // 5. Shallow merge any other fields
    const shallowUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k]) => !k.startsWith("__"))
    );
    if (Object.keys(shallowUpdates).length > 0) {
      Object.assign(post, shallowUpdates);
    }
  };

  let matched = false;

  postKeys.forEach((key) => {
    const list = state[key];
    if (!Array.isArray(list)) return;

    const index = list.findIndex((post) => post._id === postId);
    if (index !== -1) {
      applyCustomUpdate(list[index]);
      matched = true;
    }
  });

  if (state.selectedPost?._id === postId || state.selectedReview?._id === postId) {
    const selected = state.selectedPost || state.selectedReview;
    applyCustomUpdate(selected);
    matched = true;
  }
};
