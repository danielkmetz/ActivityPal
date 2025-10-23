import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import axios from 'axios';
import { getUserToken } from '../functions';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const TAG = '[HiddenPostsSlice]';

// --- helpers ---
const normalizeType = (t) => {
    const s = String(t || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'check-in' || s === 'check_in' || s === 'checkin') return 'check-in';
    if (s === 'shared-post' || s === 'shared_post' || s === 'sharedpost' || s === 'sharedpost') return 'sharedpost';
    if (s === 'activityinvite' || s === 'activity-invite' || s === 'activity_invite' || s === 'invite') return 'invite';
    return s; // review | event | promotion | livestream etc.
};

const normalizeKeyStr = (key) => {
    const [rawT, id] = String(key || '').split(':');
    return `${normalizeType(rawT)}:${String(id || '')}`;
};

// Use canonicalization for records too
const hiddenKey = (r) => {
    const rawT = r?.targetRef || r?.post?.__typename || r?.post?.type || '';
    const t = normalizeType(rawT);
    const id = String(r?.targetId || r?.post?._id || r?.post?.id || '');
    return `${t}:${id}`;
};

const toKey = (itemOrType, id) => {
    if (typeof itemOrType === 'string') return `${normalizeType(itemOrType)}:${String(id)}`;
    const t = normalizeType(itemOrType?.__typename || itemOrType?.type || '');
    const i = String(itemOrType?._id || itemOrType?.id);
    return `${t}:${i}`;
};

const rawTypeToModelRef = (raw) => {
    const t = normalizeType(raw);
    if (t === 'checkin') return 'CheckIn';
    if (t === 'sharedpost') return 'SharedPost';
    if (t === 'invite') return 'ActivityInvite';
    // fallback: capitalize first letter
    return (t[0]?.toUpperCase() || '') + t.slice(1);
};

// --- substate defaults ---
const initialHiddenList = {
    items: [],        // [{ hiddenId, targetRef, targetId, createdAt, post? }]
    status: 'idle',
    error: null,
    include: 'docs',  // 'docs' | 'ids'
    postType: null,   // filter used in the call, e.g. 'review'
};

// --- thunks ---
export const fetchHiddenPostIds = createAsyncThunk(
    'hiddenPosts/fetchHiddenPostIds',
    async (_, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            const { data } = await axios.get(`${BASE_URL}/hidden-posts`, { headers: { Authorization: `Bearer ${token}` } });
            return data?.keys || [];
        } catch (e) {
            console.warn(TAG, 'fetchHiddenPostIds error', e?.message);
            return rejectWithValue(e?.message || 'Failed to fetch hidden posts');
        }
    }
);

export const hidePost = createAsyncThunk(
    'hiddenPosts/hidePost',
    async ({ postType, postId }, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            const { data } = await axios.post(`${BASE_URL}/hidden-posts/${postType}/${postId}`, null, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return data?.key; // e.g., 'review:<id>'
        } catch (e) {
            console.warn(TAG, 'hidePost error', { postType, postId, msg: e?.message });
            return rejectWithValue(e?.message || 'Failed to hide post');
        }
    }
);

export const unhidePost = createAsyncThunk(
    'hiddenPosts/unhidePost',
    async ({ postType, postId }, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            const { data } = await axios.delete(`${BASE_URL}/hidden-posts/${postType}/${postId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return data?.key; // e.g., 'review:<id>'
        } catch (e) {
            console.warn(TAG, 'unhidePost error', { postType, postId, msg: e?.message });
            return rejectWithValue(e?.message || 'Failed to unhide post');
        }
    }
);

// Non-paginated enriched fetch
export const fetchHiddenPostsAll = createAsyncThunk(
    'hidden/fetchHiddenPostsAll',
    async ({ postType, include = 'docs' } = {}, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            const params = new URLSearchParams();
            if (postType) params.set('postType', postType);  // 'review' | 'check-in' | 'sharedPost' | 'event' | 'promotion' | 'activityInvite'
            params.set('include', include);                   // 'docs' (default) or 'ids'
            params.set('limit', '100');                       // server cap; one shot

            const { data } = await axios.get(`${BASE_URL}/hidden-posts?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!data?.success) throw new Error(data?.message || 'Request failed');

            return {
                include,
                postType: postType || null,
                items: Array.isArray(data.items) ? data.items : [],
            };
        } catch (e) {
            return rejectWithValue(e?.message || 'Failed to fetch hidden posts');
        }
    }
);

// --- slice ---
const HiddenSlice = createSlice({
    name: 'hiddenPosts',
    initialState: {
        map: {},           // { [key]: true } e.g., 'review:123' => true
        status: 'idle',    // status of fetchHiddenPostIds
        error: null,
        hiddenList: { ...initialHiddenList },
    },
    reducers: {
        removeHiddenKey(state, action) { delete state.map[action.payload]; },
        clearHiddenState(state) {
            state.map = {};
            state.status = 'idle';
            state.error = null;
            state.hiddenList = { ...initialHiddenList };
        },
    },
    extraReducers: (builder) => {
        builder
            // ---------- keys-only hydration ----------
            .addCase(fetchHiddenPostIds.pending, (s) => { s.status = 'loading'; s.error = null; })
            .addCase(fetchHiddenPostIds.fulfilled, (s, { payload }) => {
                s.status = 'succeeded';
                const next = {};
                (payload || []).forEach((k) => { next[normalizeKeyStr(k)] = true; });
                s.map = next;
            })
            .addCase(fetchHiddenPostIds.rejected, (s, { payload }) => { s.status = 'failed'; s.error = payload; })

            // ---------- enriched list (non-paginated) ----------
            .addCase(fetchHiddenPostsAll.pending, (state, action) => {
                state.hiddenList.status = 'loading';
                state.hiddenList.error = null;
                const nextInclude = action.meta?.arg?.include || 'docs';
                const nextType = action.meta?.arg?.postType || null;
                if (state.hiddenList.include !== nextInclude || state.hiddenList.postType !== nextType) {
                    state.hiddenList.items = [];
                }
            })
            .addCase(fetchHiddenPostsAll.fulfilled, (state, { payload }) => {
                const { include, postType, items } = payload || {};
                const dedup = new Map();
                for (const r of items || []) dedup.set(hiddenKey(r), r);
                state.hiddenList.items = Array.from(dedup.values());
                state.hiddenList.include = include || 'docs';
                state.hiddenList.postType = postType ?? null;
                state.hiddenList.status = 'succeeded';
                state.hiddenList.error = null;

                // Sync the key map using normalized record keys
                const merged = { ...state.map };
                for (const r of state.hiddenList.items) merged[hiddenKey(r)] = true;
                state.map = merged;
            })
            .addCase(fetchHiddenPostsAll.rejected, (state, { payload }) => {
                state.hiddenList.status = 'failed';
                state.hiddenList.error = payload || 'Failed to fetch hidden posts';
            })

            // ---------- keep both list and map in sync on hide/unhide ----------
            .addCase(unhidePost.fulfilled, (state, { payload: key }) => {
                if (!key) return;
                const nk = normalizeKeyStr(key);          // <- normalize payload
                delete state.map[nk];
                state.hiddenList.items = state.hiddenList.items.filter((r) => hiddenKey(r) !== nk);
            })
            .addCase(hidePost.fulfilled, (state, { payload: key }) => {
                if (!key) return;
                const nk = normalizeKeyStr(key);          // <- normalize payload
                state.map[nk] = true;

                const [rawT, id] = String(nk).split(':');
                if (!rawT || !id) return;

                const stub = {
                    hiddenId: `local-${Date.now()}`,
                    targetRef: rawTypeToModelRef(rawT),     // consistent model ref
                    targetId: id,
                    createdAt: new Date().toISOString(),
                    post: null,
                };

                const map = new Map(state.hiddenList.items.map((r) => [hiddenKey(r), r]));
                map.set(hiddenKey(stub), stub);           // uses canonical hiddenKey
                state.hiddenList.items = Array.from(map.values());
            });
    }
});

export const { removeHiddenKey, clearHiddenState } = HiddenSlice.actions;

// --- selectors ---
export const selectHiddenMap = (state) => state.hiddenPosts?.map || {};
export const makeSelectIsHidden = () =>
    createSelector(
        [selectHiddenMap, (_, itemOrType, id) => toKey(itemOrType, id)],
        (map, key) => !!map[key]
    );
export const selectIsHiddenByKey = (state, key) => !!(state.hiddenPosts?.map?.[key]);

export const selectHiddenList = (state) => state.hiddenPosts?.hiddenList || initialHiddenList;
export const selectHiddenListItems = (state) => selectHiddenList(state).items;
export const selectHiddenListStatus = (state) => selectHiddenList(state).status;
export const selectHiddenListInclude = (state) => selectHiddenList(state).include;
export const selectHiddenCount = (state) => Object.keys(selectHiddenMap(state)).length;

// Batch helper: returns an array of booleans for an array of items
export const makeSelectHiddenFlags = () =>
    createSelector(
        [selectHiddenMap, (_, items) => items || []],
        (map, items) => items.map((it) => map[toKey(it)] || false)
    );

export default HiddenSlice.reducer;
