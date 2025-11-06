import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import axios from 'axios';
import { getUserToken } from '../functions';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const TAG = '[HiddenPostsSlice]';

/* ------------------------------- helpers ------------------------------- */

// Normalize anything we get (e.g., "review:123" or "123") to just "123"
const toIdOnly = (keyOrId) => {
  const s = String(keyOrId ?? '').trim();
  if (!s) return '';
  const parts = s.split(':');
  return parts.length > 1 ? parts[1] : parts[0];
};

// Pull an id from hidden record shapes returned by the API
const idFromHiddenRecord = (r) =>
  toIdOnly(r?.targetId || r?.post?._id || r?.post?.id || r?._id || '');

// Build a stable map { [postId]: true }
const listToIdMap = (keysOrIds = []) => {
  const m = {};
  for (const k of keysOrIds) {
    const id = toIdOnly(k);
    if (id) m[id] = true;
  }
  return m;
};

// Convert an array of records into a deduped list keyed by postId
const dedupHiddenRecordsById = (records = []) => {
  const map = new Map(); // postId -> record
  for (const r of records) {
    const id = idFromHiddenRecord(r);
    if (id) map.set(id, r);
  }
  return Array.from(map.values());
};

/* ------------------------------ thunks ------------------------------ */

// GET /hidden-posts → should return { keys: string[] } where strings can be "id" or "type:id"
export const fetchHiddenPostIds = createAsyncThunk(
  'hiddenPosts/fetchHiddenPostIds',
  async (_, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const { data } = await axios.get(`${BASE_URL}/hidden-posts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return Array.isArray(data?.keys) ? data.keys : [];
    } catch (e) {
      console.warn(TAG, 'fetchHiddenPostIds error', e?.message);
      return rejectWithValue(e?.message || 'Failed to fetch hidden posts');
    }
  }
);

// POST /hidden-posts/:postId  (server should be updated to id-only)
export const hidePost = createAsyncThunk(
  'hiddenPosts/hidePost',
  async ({ postId }, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const { data } = await axios.post(`${BASE_URL}/hidden-posts/${postId}`, null, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // server may return "type:id" or "id"; normalize to id
      return toIdOnly(data?.key ?? postId);
    } catch (e) {
      console.warn(TAG, 'hidePost error', { postId, msg: e?.message });
      return rejectWithValue(e?.message || 'Failed to hide post');
    }
  }
);

// DELETE /hidden-posts/:postId
export const unhidePost = createAsyncThunk(
  'hiddenPosts/unhidePost',
  async ({ postId }, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const { data } = await axios.delete(`${BASE_URL}/hidden-posts/${postId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return toIdOnly(data?.key ?? postId);
    } catch (e) {
      console.warn(TAG, 'unhidePost error', { postId, msg: e?.message });
      return rejectWithValue(e?.message || 'Failed to unhide post');
    }
  }
);

// Optional: enriched, non-paginated list (kept for tools/UI that show a table)
export const fetchHiddenPostsAll = createAsyncThunk(
  'hidden/fetchHiddenPostsAll',
  async ({ include = 'docs', postType } = {}, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const params = new URLSearchParams();
      if (postType) params.set('postType', postType); // still supported server-side if you need filtering
      params.set('include', include);
      params.set('limit', '100');

      const { data } = await axios.get(`${BASE_URL}/hidden-posts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!data?.success) throw new Error(data?.message || 'Request failed');

      const items = Array.isArray(data.items) ? data.items : [];
      return { include, postType: postType || null, items };
    } catch (e) {
      return rejectWithValue(e?.message || 'Failed to fetch hidden posts');
    }
  }
);

/* -------------------------------- slice ------------------------------- */

const initialHiddenList = {
  items: [],           // [{ hiddenId, targetId, createdAt, post? }] (shape may vary per API)
  status: 'idle',
  error: null,
  include: 'docs',
  postType: null,
};

const HiddenSlice = createSlice({
  name: 'hiddenPosts',
  initialState: {
    map: {},         // { [postId]: true }  <-- id-only
    status: 'idle',
    error: null,
    hiddenList: { ...initialHiddenList },
  },
  reducers: {
    removeHiddenKey(state, action) {
      const id = toIdOnly(action.payload);
      if (id) delete state.map[id];
    },
    clearHiddenState(state) {
      state.map = {};
      state.status = 'idle';
      state.error = null;
      state.hiddenList = { ...initialHiddenList };
    },
  },
  extraReducers: (builder) => {
    builder
      // ids-only hydration
      .addCase(fetchHiddenPostIds.pending, (s) => { s.status = 'loading'; s.error = null; })
      .addCase(fetchHiddenPostIds.fulfilled, (s, { payload }) => {
        s.status = 'succeeded';
        s.map = listToIdMap(payload);
      })
      .addCase(fetchHiddenPostIds.rejected, (s, { payload }) => {
        s.status = 'failed';
        s.error = payload;
      })

      // enriched list (non-paginated)
      .addCase(fetchHiddenPostsAll.pending, (state, action) => {
        state.hiddenList.status = 'loading';
        state.hiddenList.error = null;
        const nextInclude = action.meta?.arg?.include || 'docs';
        const nextType    = action.meta?.arg?.postType || null;
        if (state.hiddenList.include !== nextInclude || state.hiddenList.postType !== nextType) {
          state.hiddenList.items = [];
        }
      })
      .addCase(fetchHiddenPostsAll.fulfilled, (state, { payload }) => {
        const { include, postType, items } = payload || {};
        const dedup = dedupHiddenRecordsById(items);
        state.hiddenList.items   = dedup;
        state.hiddenList.include = include || 'docs';
        state.hiddenList.postType = postType ?? null;
        state.hiddenList.status  = 'succeeded';
        state.hiddenList.error   = null;

        // Sync the id-only map
        const merged = { ...state.map };
        for (const r of dedup) {
          const id = idFromHiddenRecord(r);
          if (id) merged[id] = true;
        }
        state.map = merged;
      })
      .addCase(fetchHiddenPostsAll.rejected, (state, { payload }) => {
        state.hiddenList.status = 'failed';
        state.hiddenList.error = payload || 'Failed to fetch hidden posts';
      })

      // keep map/list in sync on hide/unhide
      .addCase(hidePost.fulfilled, (state, { payload }) => {
        const id = toIdOnly(payload);
        if (!id) return;
        state.map[id] = true;

        // Best-effort stub (list is optional UI; we keep a minimal record)
        const stub = {
          hiddenId: `local-${Date.now()}`,
          targetId: id,
          createdAt: new Date().toISOString(),
          post: null,
        };
        const curr = state.hiddenList.items || [];
        const byId = new Map(curr.map((r) => [idFromHiddenRecord(r), r]));
        byId.set(id, stub);
        state.hiddenList.items = Array.from(byId.values());
      })
      .addCase(unhidePost.fulfilled, (state, { payload }) => {
        const id = toIdOnly(payload);
        if (!id) return;
        delete state.map[id];
        state.hiddenList.items = (state.hiddenList.items || []).filter(
          (r) => idFromHiddenRecord(r) !== id
        );
      });
  },
});

export const { removeHiddenKey, clearHiddenState } = HiddenSlice.actions;

/* ------------------------------- selectors ------------------------------ */

export const selectHiddenMap = (state) => state.hiddenPosts?.map || {};
export const selectHiddenList = (state) => state.hiddenPosts?.hiddenList || initialHiddenList;
export const selectHiddenListItems = (state) => selectHiddenList(state).items;
export const selectHiddenListStatus = (state) => selectHiddenList(state).status;
export const selectHiddenListInclude = (state) => selectHiddenList(state).include;
export const selectHiddenCount = (state) => Object.keys(selectHiddenMap(state)).length;

// Is a single item hidden?  (itemOrId can be an object with _id/id or a raw id string)
const toItemId = (itemOrId) =>
  typeof itemOrId === 'string' ? toIdOnly(itemOrId) : toIdOnly(itemOrId?._id || itemOrId?.id);

export const makeSelectIsHidden = () =>
  createSelector(
    [selectHiddenMap, (_, itemOrId) => toItemId(itemOrId)],
    (map, id) => !!(id && map[id])
  );

export const selectIsHiddenById = (state, id) => !!(selectHiddenMap(state)[toIdOnly(id)]);

// Batch helper
export const makeSelectHiddenFlags = () =>
  createSelector(
    [selectHiddenMap, (_, items) => items || []],
    (map, items) => items.map((it) => !!map[toItemId(it)])
  );

export default HiddenSlice.reducer;
