import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getUserToken } from '../functions';
import { pushSharedPostToProfileReviews, pushSharedPostToUserAndFriends } from './ReviewsSlice';
import { updateSharedPostInReviews } from './ReviewsSlice';
import axios from 'axios';

// 🔐 Base config
const API_BASE = `${process.env.EXPO_PUBLIC_SERVER_URL}/sharedPosts`;

const getAuthHeaders = async () => {
  const token = await getUserToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

// Create a shared post
export const createSharedPost = createAsyncThunk(
  'sharedPosts/create',
  async ({ postType, originalPostId, caption }, { dispatch, rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();

      const res = await axios.post(API_BASE, { postType, originalPostId, caption }, config);
      const sharedPost = res.data;

      dispatch(pushSharedPostToUserAndFriends(sharedPost));
      dispatch(pushSharedPostToProfileReviews(sharedPost));

      return sharedPost;
    } catch (err) {
      console.error('❌ Error creating shared post:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to create shared post' });
    }
  }
);

export const toggleLikeOnSharedPost = createAsyncThunk(
  'sharedPosts/toggleLike',
  async ({ postId, userId, fullName }, { dispatch, rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();
      const res = await axios.post(`${API_BASE}/${postId}/like`, {
        userId,
        fullName,
      }, config);

      const updatedLikes = res.data.likes;

      dispatch(updateSharedPostInReviews({
        postId,
        updates: {
          __updatePostLikes: updatedLikes,
        },
      }));

      return { postId, likes: updatedLikes };
    } catch (err) {
      console.error('❌ Error toggling like on shared post:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to toggle like' });
    }
  }
);

// Get a shared post by ID
export const fetchSharedPostById = createAsyncThunk(
  'sharedPosts/fetchById',
  async (sharedPostId, { rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();

      const res = await axios.get(`${API_BASE}/${sharedPostId}`, config);
      return res.data;
    } catch (err) {
      console.error('❌ Error fetching shared post by ID:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to fetch shared post' });
    }
  }
);

// Get shared posts by user
export const fetchSharedPostsByUser = createAsyncThunk(
  'sharedPosts/fetchByUser',
  async (userId, { rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();

      const res = await axios.get(`${API_BASE}/by-user/${userId}`, config);
      return res.data;
    } catch (err) {
      console.error('❌ Error fetching shared posts by user:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to fetch shared posts' });
    }
  }
);

// Delete a shared post
export const deleteSharedPost = createAsyncThunk(
  'sharedPosts/delete',
  async (sharedPostId, { rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();

      await axios.delete(`${API_BASE}/${sharedPostId}`, config);
      return sharedPostId;
    } catch (err) {
      console.error('❌ Error deleting shared post:', err.response?.data || err.message);
      return rejectWithValue(err.response?.data || { error: 'Failed to delete shared post' });
    }
  }
);

// Add comment to shared post
export const addCommentToSharedPost = createAsyncThunk(
  'sharedPosts/addComment',
  async ({ sharedPostId, userId, fullName, commentText, media }, { dispatch, rejectWithValue, getState }) => {
    try {
      const config = await getAuthHeaders();
      const res = await axios.post(`${API_BASE}/${sharedPostId}/comment`, {
        userId, fullName, commentText, media
      }, config);

      const comment = res.data.comment;

      dispatch(updateSharedPostInReviews({
        postId: sharedPostId,
        updates: {
          __appendComment: comment,
        }
      }));

      return { sharedPostId, comment };
    } catch (err) {
      return rejectWithValue(err.response?.data || { error: 'Failed to add comment' });
    }
  }
);

// Add reply to a comment or reply
export const addReplyToSharedPost = createAsyncThunk(
  'sharedPosts/addReply',
  async ({ sharedPostId, commentId, userId, fullName, commentText, media }, { dispatch, rejectWithValue, getState }) => {
    try {
      const config = await getAuthHeaders();
      const res = await axios.post(`${API_BASE}/${sharedPostId}/comments/${commentId}/replies`, {
        userId, fullName, commentText, media
      }, config);

      const reply = res.data.reply;

      // Manual reply injection happens in reducer using a custom field
      dispatch(updateSharedPostInReviews({
        postId: sharedPostId,
        updates: {
          __appendReply: { commentId, reply },
        }
      }));

      return { sharedPostId, commentId, reply };
    } catch (err) {
      return rejectWithValue(err.response?.data || { error: 'Failed to add reply' });
    }
  }
);

// Edit a comment or reply
export const editSharedPostComment = createAsyncThunk(
  'sharedPosts/editComment',
  async ({ sharedPostId, commentId, newText, media }, { dispatch, rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();
      const res = await axios.patch(`${API_BASE}/${sharedPostId}/edit-comment/${commentId}`, {
        newText, media
      }, config);

      const updatedComment = res.data.updatedComment;

      dispatch(updateSharedPostInReviews({
        postId: sharedPostId,
        updates: {
          __updateComment: { commentId, updatedComment }
        }
      }));

      return { sharedPostId, commentId, updatedComment };
    } catch (err) {
      return rejectWithValue(err.response?.data || { error: 'Failed to edit comment' });
    }
  }
);

// Delete a comment or reply
export const deleteSharedPostComment = createAsyncThunk(
  'sharedPosts/deleteComment',
  async ({ sharedPostId, commentId }, { dispatch, rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();
      await axios.delete(`${API_BASE}/${sharedPostId}/delete-comment/${commentId}`, config);

      dispatch(updateSharedPostInReviews({
        postId: sharedPostId,
        updates: {
          __deleteComment: commentId,
        }
      }));

      return { sharedPostId, commentId };
    } catch (err) {
      return rejectWithValue(err.response?.data || { error: 'Failed to delete comment' });
    }
  }
);

// Like/unlike comment or reply
export const toggleLikeOnSharedPostComment = createAsyncThunk(
  'sharedPosts/toggleCommentLike',
  async ({ sharedPostId, commentId, userId, fullName }, { dispatch, rejectWithValue }) => {
    try {
      const config = await getAuthHeaders();
      const res = await axios.put(`${API_BASE}/${sharedPostId}/comments/${commentId}/like`, {
        userId, fullName
      }, config);

      const likes = res.data.likes;

      dispatch(updateSharedPostInReviews({
        postId: sharedPostId,
        updates: {
          __updateCommentLikes: { commentId, likes }
        }
      }));

      return { sharedPostId, commentId, likes };
    } catch (err) {
      return rejectWithValue(err.response?.data || { error: 'Failed to toggle like' });
    }
  }
);

const updateSharedPostLocallyById = (state, sharedPostId, updaterFn) => {
  const post = state.byId[sharedPostId];
  if (post) updaterFn(post);
};

// 🧠 Slice
const sharedPostsSlice = createSlice({
  name: 'sharedPosts',
  initialState: {
    byId: {},
    userPosts: [],
    loading: false,
    error: null,
  },
  reducers: {
    resetSharedPostsState: (state) => {
      state.byId = {};
      state.userPosts = [];
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createSharedPost.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createSharedPost.fulfilled, (state, action) => {
        state.loading = false;
        state.byId[action.payload._id] = action.payload;
        state.userPosts.unshift(action.payload); // optional: auto-prepend
      })
      .addCase(createSharedPost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.error || 'Failed to create shared post';
      })
      .addCase(fetchSharedPostById.fulfilled, (state, action) => {
        state.byId[action.payload._id] = action.payload;
      })
      .addCase(fetchSharedPostsByUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSharedPostsByUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userPosts = action.payload;
        action.payload.forEach((post) => {
          state.byId[post._id] = post;
        });
      })
      .addCase(fetchSharedPostsByUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.error || 'Failed to fetch shared posts';
      })
      .addCase(deleteSharedPost.fulfilled, (state, action) => {
        const id = action.payload;
        delete state.byId[id];
        state.userPosts = state.userPosts.filter((post) => post._id !== id);
      })
      .addCase(toggleLikeOnSharedPost.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(toggleLikeOnSharedPost.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(toggleLikeOnSharedPost.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.error || 'Failed to toggle like';
      })
      .addCase(addCommentToSharedPost.fulfilled, (state, action) => {
        const { sharedPostId, comment } = action.payload;

        updateSharedPostLocallyById(state, sharedPostId, (post) => {
          post.comments = post.comments || [];
          post.comments.push(comment);
        });
      })
      .addCase(addReplyToSharedPost.fulfilled, (state, action) => {
        const { sharedPostId, commentId, reply } = action.payload;

        updateSharedPostLocallyById(state, sharedPostId, (post) => {
          const insert = (comments) => {
            for (const c of comments) {
              if (c._id === commentId) {
                c.replies = [...(c.replies || []), reply];
                return true;
              }
              if (c.replies && insert(c.replies)) return true;
            }
            return false;
          };
          insert(post.comments || []);
        });
      })

      .addCase(editSharedPostComment.fulfilled, (state, action) => {
        const { sharedPostId, commentId, updatedComment } = action.payload;

        updateSharedPostLocallyById(state, sharedPostId, (post) => {
          const update = (comments) => {
            for (const c of comments) {
              if (c._id === commentId) {
                Object.assign(c, updatedComment);
                return true;
              }
              if (c.replies && update(c.replies)) return true;
            }
            return false;
          };
          update(post.comments || []);
        });
      })

      .addCase(deleteSharedPostComment.fulfilled, (state, action) => {
        const { sharedPostId, commentId } = action.payload;

        updateSharedPostLocallyById(state, sharedPostId, (post) => {
          const remove = (comments) =>
            comments
              .map((c) => {
                if (c._id === commentId) return null;
                if (c.replies) c.replies = remove(c.replies);
                return c;
              })
              .filter(Boolean);

          post.comments = remove(post.comments || []);
        });
      })

      .addCase(toggleLikeOnSharedPostComment.fulfilled, (state, action) => {
        const { sharedPostId, commentId, likes } = action.payload;

        updateSharedPostLocallyById(state, sharedPostId, (post) => {
          const update = (comments) => {
            for (const c of comments) {
              if (c._id === commentId) {
                c.likes = likes;
                return true;
              }
              if (c.replies && update(c.replies)) return true;
            }
            return false;
          };
          update(post.comments || []);
        });
      })
  },
})

// ✅ Exports
export const { resetSharedPostsState } = sharedPostsSlice.actions;
export default sharedPostsSlice.reducer;
