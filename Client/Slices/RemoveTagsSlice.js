// Slices/RemoveTagsSlice.js
import { createSlice, createAsyncThunk, isAnyOf } from '@reduxjs/toolkit';
import api from '../api';
import { normalizePostType } from '../utils/normalizePostType';

/* Ensure this matches how you mounted it:
   app.use('/api/remove-tags', removeTags)
*/
const BASE = `${process.env.EXPO_SERVER_URL}/remove-tags`;

const keyOf = (postType, postId) => `${normalizePostType(postType)}:${String(postId)}`;

// ---- Thunks -------------------------------------------------------------

// DELETE /api/remove-tags/:postType/:postId
export const removeSelfFromPost = createAsyncThunk(
  'removeTags/removeFromPost',
  async ({ postType, postId }, { rejectWithValue }) => {
    try {
      const url = `${BASE}/${encodeURIComponent(postType)}/${encodeURIComponent(postId)}`;
      const { data } = await api.delete(url);
      return { postType, postId, data };
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to remove tag from post';
      return rejectWithValue({ message, details: err?.response?.data });
    }
  }
);

// DELETE /api/remove-tags/:postType/:postId/photo/:photoId
export const removeSelfFromPhoto = createAsyncThunk(
  'removeTags/removeFromPhoto',
  async ({ postType, postId, photoId }, { rejectWithValue }) => {
    try {
      const url = `${BASE}/${encodeURIComponent(postType)}/${encodeURIComponent(postId)}/photo/${encodeURIComponent(photoId)}`;
      const { data } = await api.delete(url);
      return { postType, postId, photoId, data };
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to remove tag from photo';
      return rejectWithValue({ message, details: err?.response?.data });
    }
  }
);

// ---- Slice (request state only) ----------------------------------------

const initialState = {
  statusByKey: {}, // { 'review:123': 'pending'|'succeeded'|'failed' }
  errorByKey: {},  // { 'review:123': { message, details? } }
};

const removeTagsSlice = createSlice({
  name: 'removeTags',
  initialState,
  reducers: {
    clearSelfTagError(state, action) {
      const k = action.payload;
      if (k) delete state.errorByKey[k];
    },
    clearSelfTagStatus(state, action) {
      const k = action.payload;
      if (k) {
        delete state.statusByKey[k];
        delete state.errorByKey[k];
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(
        isAnyOf(removeSelfFromPost.pending, removeSelfFromPhoto.pending),
        (state, action) => {
          const { postType, postId } = action.meta.arg || {};
          const k = keyOf(postType, postId);
          state.statusByKey[k] = 'pending';
          delete state.errorByKey[k];
        }
      )
      .addMatcher(
        isAnyOf(removeSelfFromPost.fulfilled, removeSelfFromPhoto.fulfilled),
        (state, action) => {
          // prefer payload for normalized postType, but fall back to meta.arg if needed
          const { postType, postId } = action.payload || action.meta.arg || {};
          const k = keyOf(postType, postId);
          state.statusByKey[k] = 'succeeded';
          delete state.errorByKey[k];
        }
      )
      .addMatcher(
        isAnyOf(removeSelfFromPost.rejected, removeSelfFromPhoto.rejected),
        (state, action) => {
          const { postType, postId } = action.meta.arg || {};
          const k = keyOf(postType, postId);
          state.statusByKey[k] = 'failed';
          state.errorByKey[k] = action.payload || { message: 'Request failed' };
        }
      );
  },
});

export const { clearSelfTagError, clearSelfTagStatus } = removeTagsSlice.actions;

// ---- Selectors ----------------------------------------------------------

export const selectSelfTagStatus = (state, postType, postId) =>
  state.removeTags.statusByKey[keyOf(postType, postId)];

export const selectSelfTagError = (state, postType, postId) =>
  state.removeTags.errorByKey[keyOf(postType, postId)];

export default removeTagsSlice.reducer;
