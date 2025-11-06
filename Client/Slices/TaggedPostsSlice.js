import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import client from '../apolloClient';
import { GET_USER_TAGGED_POSTS_QUERY } from './GraphqlQueries/Queries/getUserTaggedPosts';
import axios from 'axios';
import { getUserToken } from '../functions';
import { removeSelfFromPost, removeSelfFromPhoto } from './RemoveTagsSlice';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_KEYS = Object.freeze({});
const EMPTY_FEED = Object.freeze({
    items: EMPTY_ARRAY,
    keys: EMPTY_KEYS,
    status: 'idle',
    error: null,
    hasMore: true,
    cursor: null,
    refreshing: false,
    page: 0,
});

// ---------- Helpers ----------
const toStr = (v) => (v == null ? '' : String(v));
const typeOf = (item) => (item?.__typename || item?.type || '').toLowerCase();
const idOf = (item) => toStr(item?._id || item?.id);
const idOnly = (v) => String(v ?? '').trim().split(':').pop();
const getCompositeKey = (item) => {
    const typ = toStr(item?.__typename || item?.type || 'Post');
    const id = toStr(item?._id || item?.id);
    return `${typ}:${id}`;
};
const getSortDate = (item) => {
    const raw = item?.sortDate || item?.date || item?.createdAt || null;
    if (!raw) return null;
    try {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
    } catch {
        return null;
    }
};
const normalizePostTypeForCompare = (t) => {
    const s = String(t || '').toLowerCase();
    if (s === 'checkin') return 'check-in';
    return s;
};
const stillTaggedForUser = (item, userId) => {
    const uid = toStr(userId);
    const postTags = Array.isArray(item?.taggedUsers)
        ? item.taggedUsers.some((t) => toStr(t?.userId || t) === uid)
        : false;
    const photoTags = Array.isArray(item?.photos)
        ? item.photos.some(
            (p) =>
                Array.isArray(p?.taggedUsers) &&
                p.taggedUsers.some((t) => toStr(t?.userId) === uid)
        )
        : false;
    return postTags || photoTags;
};

const getInnerPost = (wrapper) =>
    wrapper?.post || wrapper?.review || wrapper?.checkIn || wrapper?.sharedPost || wrapper?.live || null;

const compKeyForHidden = (wrapper) => {
    const p = getInnerPost(wrapper);
    if (!p) return getCompositeKey(wrapper); // fallback
    const typ = toStr(p.__typename || p.type || 'Post');
    const id = toStr(p._id || p.id);
    return `${typ}:${id}`;
};

const hidKey = (postId) => idOnly(postId);

// One user's feed state
const makeFeedState = () => ({
    items: [],
    keys: {},
    status: 'idle',
    error: null,
    hasMore: true,
    cursor: null, // { id, sortDate }
    refreshing: false,
    page: 0,
});

// Append with dedupe; computed on a per-feed basis
function appendResults(feed, payloadItems) {
    if (!Array.isArray(payloadItems) || payloadItems.length === 0) return;
    for (const item of payloadItems) {
        if (!item) continue;
        const key = getCompositeKey(item);
        if (!key || feed.keys[key]) continue; // dedupe
        feed.items.push(item);
        feed.keys[key] = true;
    }
    const last = feed.items[feed.items.length - 1];
    const lastId = toStr(last?._id || last?.id);
    const lastSortDate = getSortDate(last);
    feed.cursor = lastId && lastSortDate ? { id: lastId, sortDate: lastSortDate } : null;
    feed.hasMore = payloadItems.length > 0;
}

// Ensure feed bucket exists
function ensureFeed(state, userId) {
    const uid = toStr(userId);
    if (!uid) return null;
    if (!state.byUser[uid]) state.byUser[uid] = makeFeedState();
    return state.byUser[uid];
}

// ---------- Thunks ----------

/**
 * Fetch next (or first) page of tagged posts for a specific user.
 * Args: { userId, limit = 15, after }
 */
export const fetchTaggedPosts = createAsyncThunk(
    'taggedPosts/fetchTaggedPosts',
    async ({ userId, limit = 15, after }, { rejectWithValue }) => {
        try {
            const { data, errors } = await client.query({
                query: GET_USER_TAGGED_POSTS_QUERY,
                variables: { userId, limit, after: after || null },
                fetchPolicy: 'network-only',
            });

            if (errors?.length) {
                throw new Error(errors.map((e) => e.message).join('; '));
            }

            const items = Array.isArray(data?.getUserTaggedPosts) ? data.getUserTaggedPosts : [];
            const hasMore = items.length === limit;

            const last = items[items.length - 1];
            const lastId = toStr(last?._id || last?.id);
            const lastSortDate = getSortDate(last);
            const nextCursor = lastId && lastSortDate ? { id: lastId, sortDate: lastSortDate } : null;

            return { userId, items, hasMore, nextCursor, pageSize: limit };
        } catch (err) {
            return rejectWithValue({ userId, message: err?.message || 'Failed to fetch tagged posts' });
        }
    }
);

/**
 * Refresh a user's tagged posts (clear feed then fetch page 1).
 * Args: { userId, limit = 15 }
 */
export const refreshTaggedPosts = createAsyncThunk(
    'taggedPosts/refreshTaggedPosts',
    async ({ userId, limit = 15 }, { dispatch, rejectWithValue }) => {
        try {
            const res = await dispatch(fetchTaggedPosts({ userId, limit, after: null }));
            if (res.meta.requestStatus === 'rejected') {
                throw new Error(res.payload?.message || 'Refresh failed');
            }
            return res.payload;
        } catch (err) {
            return rejectWithValue({ userId, message: err?.message || 'Failed to refresh tagged posts' });
        }
    }
);

/**
 * Hide a tagged post from the *authenticated user's* profile.
 * Optionally pass forUserId to update that cache immediately (defaults to activeUserId in reducers).
 * Args: { postType, postId, forUserId? }
 */
export const hideTaggedPost = createAsyncThunk(
    'taggedPosts/hideTaggedPost',
    async ({ postId }, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            const { data } = await axios.post(
                `${BASE_URL}/hidden-tags/${idOnly(postId)}`,
                null,
                { headers: { Authorization: token ? `Bearer ${token}` : '' } }
            );
            // server may return "type:id" or "id" in data.key — normalize to id
            return { postId: idOnly(data?.key ?? postId) };
        } catch (err) {
            const message = err?.response?.data?.message || err?.message || 'Failed to hide tagged post';
            return rejectWithValue({ postId, message });
        }
    }
);

/**
 * Unhide a tagged post (appears again after next fetch/refresh).
 * Args: { postType, postId, forUserId? }
 */
export const unhideTaggedPost = createAsyncThunk(
    'taggedPosts/unhideTaggedPost',
    async ({ postId }, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            const { data } = await axios.delete(
                `${BASE_URL}/hidden-tags/${idOnly(postId)}`,
                { headers: { Authorization: token ? `Bearer ${token}` : '' } }
            );
            return { postId: idOnly(data?.key ?? postId) };
        } catch (err) {
            const message = err?.response?.data?.message || err?.message || 'Failed to unhide tagged post';
            return rejectWithValue({ postId, message });
        }
    }
);

export const fetchHiddenTaggedPosts = createAsyncThunk(
    'taggedPosts/fetchHiddenTaggedPosts',
    async (_, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            const { data } = await axios.get(`${BASE_URL}/hidden-tags`, {
                headers: { Authorization: token ? `Bearer ${token}` : '' },
            });

            // Your API can return either { items: [...] } or the array itself
            const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            return { items };
        } catch (err) {
            return rejectWithValue({
                message: err?.response?.data?.message || err?.message || 'Failed to fetch hidden tagged posts',
            });
        }
    }
);

export const fetchHiddenTaggedIds = createAsyncThunk(
    'taggedPosts/fetchHiddenTaggedIds',
    async (_, { rejectWithValue }) => {
        try {
            const token = await getUserToken();
            // Prefer idsOnly if supported; gracefully handle other shapes too
            const { data } = await axios.get(`${BASE_URL}/hidden-tags/ids`, {
                headers: { Authorization: token ? `Bearer ${token}` : '' },
                params: { idsOnly: true }, // backend can ignore if unsupported
            });

            // Accept any of the following:
            // 1) { items: [{ postType, postId }, ...] }
            // 2) [{ postType, postId }, ...]
            // 3) { items: [wrappers...] } or [wrappers...] => derive type/id from inner post
            const raw = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            const pairs = raw
                .map((it) => {
                    if (it?.postType && it?.postId) return { postType: it.postType, postId: it.postId };
                    const p = getInnerPost(it) || it;
                    const postType = p?.__typename || p?.type;
                    const postId = p?._id || p?.id;
                    return postType && postId ? { postType, postId } : null;
                })
                .filter(Boolean);

            return { items: pairs };
        } catch (err) {
            return rejectWithValue({
                message: err?.response?.data?.message || err?.message || 'Failed to fetch hidden tagged IDs',
            });
        }
    }
);

// ---------- Slice ----------

const initialState = {
    byUser: {},        // { [userId]: FeedState }
    activeUserId: null, // the profile user currently being viewed (optional but handy)
    hidden: makeFeedState(),
    hiddenIds: {
        map: {},          // { "review:123": true, "check-in:abc": true, ... }
        status: 'idle',
        error: null,
        lastFetchedAt: null,
    },
    globalHiddenMap: {},
};

const taggedPostsSlice = createSlice({
    name: 'taggedPosts',
    initialState,
    reducers: {
        setTaggedUser(state, action) {
            const uid = toStr(action.payload);
            state.activeUserId = uid;
            ensureFeed(state, uid);
        },
        resetTaggedForUser(state, action) {
            const uid = toStr(action.payload);
            if (!uid) return;
            state.byUser[uid] = makeFeedState();
        },
        resetAllTagged(state) {
            state.byUser = {};
            state.activeUserId = null;
        },
        removeFromTagged(state, action) {
            // Removes from ACTIVE user's feed
            const uid = state.activeUserId;
            if (!uid) return;
            const feed = ensureFeed(state, uid);
            const k = getCompositeKey(action.payload || {});
            if (!k) return;
            feed.items = (feed.items || []).filter((it) => getCompositeKey(it) !== k);
            delete feed.keys[k];

            const last = feed.items[feed.items.length - 1];
            const lastId = toStr(last?._id || last?.id);
            const lastSortDate = getSortDate(last);
            feed.cursor = lastId && lastSortDate ? { id: lastId, sortDate: lastSortDate } : null;
        },
        prependToTagged(state, action) {
            const uid = state.activeUserId;
            if (!uid) return;
            const feed = ensureFeed(state, uid);
            const item = action.payload;
            if (!item) return;
            const key = getCompositeKey(item);
            if (!key || feed.keys[key]) return;
            feed.items.unshift(item);
            feed.keys[key] = true;
        },
        removeFromHiddenTagged(state, action) {
            const { postType, postId } = action.payload || {};
            const h = state.hidden || (state.hidden = makeFeedState());
            const pid = toStr(postId);
            const ptype = normalizePostTypeForCompare(postType);
            if (!pid || !ptype) return;

            const next = [];
            for (const it of h.items || []) {
                const p = getInnerPost(it);
                const sameId = toStr(p?._id || p?.id) === pid;
                const t = normalizePostTypeForCompare(typeOf(p)); // typeOf already lowercases
                const sameType = t === ptype || (ptype === 'check-in' && t === 'checkin');

                if (sameId && sameType) {
                    const k = compKeyForHidden(it);
                    if (h.keys && k) delete h.keys[k];
                    continue; // drop it
                }
                next.push(it);
            }
            h.items = next;
        },
        applyHiddenPostUpdates(state, action) {
            const { postId, updates = {} } = action.payload || {};
            if (!postId) return;
            const h = state.hidden || (state.hidden = makeFeedState());
            const list = h.items || [];

            let anyChanged = false;

            const patchPost = (post) => {
                if (!post || typeof post !== 'object') return false;
                let changed = false;
                const mark = () => { changed = true; };

                // mirror your updatePostCollections semantics for likes
                if (updates.__updatePostLikes) {
                    const v = updates.__updatePostLikes;
                    if (Array.isArray(v)) { post.likes = v; mark(); }
                    else if (v && typeof v === 'object') {
                        if (Array.isArray(v.likes)) { post.likes = v.likes; mark(); }
                        if (typeof v.likesCount === 'number') { post.likesCount = v.likesCount; mark(); }
                        if (typeof v.liked === 'boolean') { post.liked = v.liked; mark(); }
                    }
                }

                // merge any plain fields
                for (const [k, val] of Object.entries(updates)) {
                    if (!k.startsWith('__')) { post[k] = val; mark(); }
                }

                return changed;
            };

            const pid = toStr(postId);
            for (let i = 0; i < list.length; i++) {
                const w = list[i];
                const p = getInnerPost(w);
                if (toStr(p?._id || p?.id) !== pid) continue;

                if (patchPost(p)) {
                    // bump identities so selectors/components re-render
                    list[i] = { ...w, post: p ? { ...p } : p };
                    anyChanged = true;
                }
            }

            if (anyChanged) {
                h.items = [...list];
            }
        },
        restoreUnhiddenTaggedToFeed(state, action) {
            const { item, postType, postId, forUserId } = action.payload || {};
            const uid = toStr(forUserId || state.activeUserId);
            if (!uid) return;

            const feed = ensureFeed(state, uid);

            // 1) Resolve the item to insert.
            //    - If `item` is given, use it.
            //    - Else, look it up from the `hidden.items` (wrappers) using postType/postId.
            let toInsert = item || null;
            if (!toInsert && (postType || postId)) {
                const pid = toStr(postId);
                const ptype = normalizePostTypeForCompare(postType);
                const candidates = (state.hidden && Array.isArray(state.hidden.items)) ? state.hidden.items : [];
                const wrapper = candidates.find((w) => {
                    const p = getInnerPost(w) || w;
                    const sameId = toStr(p?._id || p?.id) === pid;
                    const t = normalizePostTypeForCompare(typeOf(p)); // typeOf already lowercases
                    const sameType = t === ptype || (ptype === 'check-in' && t === 'checkin');
                    return sameId && sameType;
                });
                if (wrapper) toInsert = getInnerPost(wrapper) || wrapper;
            }
            if (!toInsert) return;

            // 2) Dedupe via composite key.
            const key = getCompositeKey(toInsert);
            if (!key) return;
            if (!feed.keys) feed.keys = {};
            if (feed.keys[key]) return;

            // 3) Insert sorted by date (newest first). Fallback: put at top if no date.
            const sd = getSortDate(toInsert);
            if (!Array.isArray(feed.items)) feed.items = [];
            if (!sd) {
                feed.items.unshift(toInsert);
            } else {
                const targetTime = Date.parse(sd);
                let idx = 0;
                while (idx < feed.items.length) {
                    const d = getSortDate(feed.items[idx]);
                    if (!d) break;
                    const t = Date.parse(d);
                    // Descending (newest first): insert before the first item that is older or equal
                    if (targetTime >= t) break;
                    idx++;
                }
                feed.items.splice(idx, 0, toInsert);
            }
            feed.keys[key] = true;

            // 4) Recompute cursor (based on last item).
            const last = feed.items[feed.items.length - 1];
            const lastId = toStr(last?._id || last?.id);
            const lastSortDate = getSortDate(last);
            feed.cursor = lastId && lastSortDate ? { id: lastId, sortDate: lastSortDate } : null;

            // 5) Also remove it from the `hidden` list if it exists there.
            const h = state.hidden || (state.hidden = makeFeedState());
            const pidForHidden = toStr(toInsert?._id || toInsert?.id);
            const ptypeForHidden = normalizePostTypeForCompare(typeOf(toInsert));
            if (Array.isArray(h.items) && h.items.length) {
                const next = [];
                for (const it of h.items) {
                    const p = getInnerPost(it) || it;
                    const sameId = toStr(p?._id || p?.id) === pidForHidden;
                    const t = normalizePostTypeForCompare(typeOf(p));
                    const sameType = t === ptypeForHidden || (ptypeForHidden === 'check-in' && t === 'checkin');
                    if (sameId && sameType) {
                        const k = compKeyForHidden(it);
                        if (h.keys && k) delete h.keys[k];
                        continue; // drop from hidden
                    }
                    next.push(it);
                }
                h.items = next;
            }

            // 6) Since it's unhidden, ensure the ID map does not mark it hidden.
            delete state.hiddenIds.map[hidKey(toInsert.__typename || toInsert.type, toInsert._id || toInsert.id)];
        },
        filterTaggedPost(state, action) {
            const { postType, postId, forUserId } = action.payload || {};
            const uid = toStr(forUserId || state.activeUserId);
            if (!uid) return;

            const feed = ensureFeed(state, uid);

            const pid = toStr(postId);
            const ptype = normalizePostTypeForCompare(postType);
            if (!pid || !ptype) return;

            const next = [];
            for (const it of feed.items || []) {
                const sameId = idOf(it) === pid;
                const t = normalizePostTypeForCompare(typeOf(it)); // typeOf already lowercases
                const sameType = t === ptype || (ptype === 'check-in' && t === 'checkin');

                if (sameId && sameType) {
                    const key = getCompositeKey(it);
                    if (feed.keys && key) delete feed.keys[key]; // drop from dedupe map
                    continue; // skip (i.e., filter it out)
                }
                next.push(it);
            }

            feed.items = next;

            // Recompute cursor based on the new last item
            const last = feed.items[feed.items.length - 1] || null;
            const lastId = toStr(last?._id || last?.id);
            const lastSortDate = getSortDate(last);
            feed.cursor = (lastId && lastSortDate) ? { id: lastId, sortDate: lastSortDate } : null;
        }
    },
    extraReducers: (builder) => {
        // ----- refresh flow -----
        builder
            .addCase(refreshTaggedPosts.pending, (state, action) => {
                const uid = toStr(action.meta?.arg?.userId);
                const feed = ensureFeed(state, uid);
                feed.refreshing = true;
                feed.error = null;
                feed.items = [];
                feed.keys = {};
                feed.status = 'pending';
                feed.hasMore = true;
                feed.cursor = null;
                feed.page = 0;
            })
            .addCase(refreshTaggedPosts.fulfilled, (state, action) => {
                const uid = toStr(action.payload?.userId);
                const feed = ensureFeed(state, uid);
                feed.refreshing = false;
                feed.status = 'succeeded';
                appendResults(feed, action.payload?.items || []);
                if (typeof action.payload?.hasMore === 'boolean') feed.hasMore = action.payload.hasMore;
                feed.page = 1;
            })
            .addCase(refreshTaggedPosts.rejected, (state, action) => {
                const uid = toStr(action.payload?.userId || action.meta?.arg?.userId);
                const feed = ensureFeed(state, uid);
                feed.refreshing = false;
                feed.status = 'failed';
                feed.error = action.payload?.message || action.error?.message || 'Refresh failed';
            });

        // ----- fetch flow -----
        builder
            .addCase(fetchTaggedPosts.pending, (state, action) => {
                const uid = toStr(action.meta?.arg?.userId);
                const feed = ensureFeed(state, uid);
                const isFirstPage = !action.meta?.arg?.after && (feed.items.length === 0);
                if (isFirstPage) feed.status = 'pending';
                feed.error = null;
            })
            .addCase(fetchTaggedPosts.fulfilled, (state, action) => {
                const uid = toStr(action.payload?.userId);
                const feed = ensureFeed(state, uid);

                feed.status = 'succeeded';
                const beforeLen = feed.items.length;
                appendResults(feed, action.payload?.items || []);
                const afterLen = feed.items.length;

                if (typeof action.payload?.hasMore === 'boolean') {
                    feed.hasMore = action.payload.hasMore;
                } else if (typeof action.payload?.pageSize === 'number') {
                    feed.hasMore = (afterLen - beforeLen) >= action.payload.pageSize;
                } else {
                    feed.hasMore = (afterLen - beforeLen) > 0;
                }

                feed.page += 1;
            })
            .addCase(fetchTaggedPosts.rejected, (state, action) => {
                const uid = toStr(action.payload?.userId || action.meta?.arg?.userId);
                const feed = ensureFeed(state, uid);
                feed.status = 'failed';
                feed.error = action.payload?.message || action.error?.message || 'Fetch failed';
            });

        // ----- hide/unhide (applies to the active user's feed by default) -----
        builder
            .addCase(hideTaggedPost.fulfilled, (state, { payload, meta }) => {
                // ✅ ALWAYS mark hidden in ID map (independent of which profile is visible)
                state.hiddenIds.map[hidKey(payload?.postId)] = true;

                // Optionally update the currently viewed tagged feed if we know which user it is
                const uid = toStr(meta?.arg?.forUserId || state.activeUserId);
                if (!uid) return;                     // <— only gate feed editing, not the ID map

                const feed = ensureFeed(state, uid);

                // remove from visible tagged feed
                feed.items = (feed.items || []).filter((it) => {
                    if (idOf(it) === toStr(payload?.postId)) {
                        const key = `${it.__typename || it.type}:${idOf(it)}`;
                        if (feed.keys && key) delete feed.keys[key];
                        return false;
                    }
                    return true;
                });
            })
            .addCase(hideTaggedPost.rejected, (state, { payload }) => {
                const uid = state.activeUserId;
                if (!uid) return;
                const feed = ensureFeed(state, uid);
                feed.error = payload?.message || 'Failed to hide tagged post';
            })
            .addCase(unhideTaggedPost.fulfilled, (state, { payload }) => {
                // ✅ unmark from ID map (post will reappear on next refresh/fetch)
                delete state.hiddenIds.map[hidKey(payload?.postId)];
            })
            .addCase(unhideTaggedPost.rejected, (state, { payload }) => {
                const uid = state.activeUserId;
                if (!uid) return;
                const feed = ensureFeed(state, uid);
                feed.error = payload?.message || 'Failed to unhide tagged post';
            });
        builder
            .addCase(fetchHiddenTaggedPosts.pending, (state) => {
                const h = state.hidden || (state.hidden = makeFeedState());
                h.status = 'pending';
                h.error = null;
            })
            .addCase(fetchHiddenTaggedPosts.fulfilled, (state, action) => {
                const h = state.hidden || (state.hidden = makeFeedState());
                const items = action.payload?.items || [];

                h.items = [];
                h.keys = {};

                for (const it of items) {
                    const k = compKeyForHidden(it);
                    if (k && !h.keys[k]) {
                        h.items.push(it);
                        h.keys[k] = true;
                    }
                }
                h.status = 'succeeded';
                h.error = null;
                h.hasMore = false;
                h.cursor = null;
                h.page = 1;
            })
            .addCase(fetchHiddenTaggedPosts.rejected, (state, action) => {
                const h = state.hidden || (state.hidden = makeFeedState());
                h.status = 'failed';
                h.error = action.payload?.message || action.error?.message || 'Fetch failed';
            });
        // ----- remove self tag (post/photo) -> affects active user's feed -----
        builder
            .addCase(removeSelfFromPost.fulfilled, (state, { payload, meta }) => {
                const uid = toStr(state.activeUserId);
                if (!uid) return;
                const feed = ensureFeed(state, uid);

                const postType = normalizePostTypeForCompare(payload?.postType || meta?.arg?.postType);
                const postId = toStr(payload?.postId || meta?.arg?.postId);

                feed.items = (feed.items || []).filter((it) => {
                    const sameId = idOf(it) === postId;
                    const sameType =
                        typeOf(it) === postType ||
                        (postType === 'check-in' && typeOf(it) === 'checkin');
                    if (sameId && sameType) {
                        const key = `${it.__typename || it.type}:${idOf(it)}`;
                        if (feed.keys && key) delete feed.keys[key];
                        return false;
                    }
                    return true;
                });
            })
            .addCase(removeSelfFromPhoto.fulfilled, (state, { payload, meta }) => {
                const uid = toStr(state.activeUserId);
                if (!uid) return;
                const feed = ensureFeed(state, uid);

                const postType = normalizePostTypeForCompare(payload?.postType || meta?.arg?.postType);
                const postId = toStr(payload?.postId || meta?.arg?.postId);
                const photoId = toStr(payload?.photoId || meta?.arg?.photoId);
                const idx = (feed.items || []).findIndex((it) => {
                    const sameId = idOf(it) === postId;
                    const sameType =
                        typeOf(it) === postType ||
                        (postType === 'check-in' && typeOf(it) === 'checkin');
                    return sameId && sameType;
                });
                if (idx < 0) return;

                const item = feed.items[idx];
                if (Array.isArray(item.photos)) {
                    item.photos = item.photos.map((p) => {
                        if (toStr(p?._id || p?.photoId) !== photoId) return p;
                        const tagged = Array.isArray(p?.taggedUsers) ? p.taggedUsers : [];
                        return {
                            ...p,
                            taggedUsers: tagged.filter((t) => toStr(t?.userId) !== uid),
                        };
                    });
                }
                if (!stillTaggedForUser(item, uid)) {
                    feed.items.splice(idx, 1);
                    const key = `${item.__typename || item.type}:${idOf(item)}`;
                    if (feed.keys && key) delete feed.keys[key];
                }
            });
        builder
            .addCase(fetchHiddenTaggedIds.pending, (state) => {
                state.hiddenIds.status = 'loading';
                state.hiddenIds.error = null;
            })
            .addCase(fetchHiddenTaggedIds.fulfilled, (state, action) => {
                const map = {};
                for (const it of action.payload?.items || []) {
                    // accept {postId}, {postType, postId}, or raw strings
                    const id = idOnly(it?.postId ?? it);
                    if (id) map[hidKey(id)] = true;
                }
                state.hiddenIds.map = map;
                state.hiddenIds.status = 'succeeded';
                state.hiddenIds.lastFetchedAt = Date.now();
            })
            .addCase(fetchHiddenTaggedIds.rejected, (state, action) => {
                state.hiddenIds.status = 'failed';
                state.hiddenIds.error = action.payload?.message || action.error?.message || 'Fetch failed';
            });
    },
});

export const {
    setTaggedUser,        // set activeUserId and ensure its feed bucket exists
    resetTaggedForUser,   // clear a single user's cache
    resetAllTagged,       // clear all caches
    removeFromTagged,
    prependToTagged,
    removeFromHiddenTagged,
    applyHiddenPostUpdates,
    restoreUnhiddenTaggedToFeed,
    filterTaggedPost,
} = taggedPostsSlice.actions;

// ---------- Selectors ----------

const base = (s) => s?.taggedPosts || initialState;
const feedOf = (s, userId) => {
    const st = base(s);
    const uid = toStr(userId || st.activeUserId);
    return (uid && st.byUser[uid]) || EMPTY_FEED;
};

// Parameterized selectors (pass userId explicitly)
// Parameterized selectors (memoized)
export const makeSelectTaggedPosts = (userId) =>
    createSelector(
        (s) => feedOf(s, userId),
        (feed) => feed.items // returns same array ref if feed didn't change
    );

export const makeSelectTaggedStatus = (userId) =>
    createSelector((s) => feedOf(s, userId), (f) => f.status);

export const makeSelectTaggedError = (userId) =>
    createSelector((s) => feedOf(s, userId), (f) => f.error);

export const makeSelectTaggedHasMore = (userId) =>
    createSelector((s) => feedOf(s, userId), (f) => f.hasMore);

export const makeSelectTaggedCursor = (userId) =>
    createSelector((s) => feedOf(s, userId), (f) => f.cursor);

export const makeSelectTaggedRefreshing = (userId) =>
    createSelector((s) => feedOf(s, userId), (f) => f.refreshing);

export const makeSelectTaggedPage = (userId) =>
    createSelector((s) => feedOf(s, userId), (f) => f.page);

// Active-user convenience (memoized too)
export const selectActiveTaggedPosts = createSelector(
    (s) => feedOf(s, null),
    (f) => f.items
);
export const selectActiveTaggedStatus = createSelector(
    (s) => feedOf(s, null),
    (f) => f.status
);
export const selectActiveTaggedHasMore = createSelector(
    (s) => feedOf(s, null),
    (f) => f.hasMore
);
export const selectActiveTaggedCursor = createSelector(
    (s) => feedOf(s, null),
    (f) => f.cursor
);
export const selectActiveTaggedRefreshing = createSelector(
    (s) => feedOf(s, null),
    (f) => f.refreshing
);
export const selectActiveTaggedError = createSelector(
    (s) => feedOf(s, null),
    (f) => f.error
);

// Grouped-by-type — already memoized; recomputes only when items ref changes
export const makeSelectTaggedByType = (userId) =>
    createSelector(makeSelectTaggedPosts(userId), (items) => {
        const out = { Review: [], CheckIn: [], SharedPost: [], LiveStream: [] };
        for (const it of items || []) {
            const t = it?.__typename || it?.type;
            if (t && out[t]) out[t].push(it);
        }
        return out;
    });

export default taggedPostsSlice.reducer;

// Hidden tagged posts selectors
export const selectHiddenPosts = (s) => (s?.taggedPosts?.hidden?.items || EMPTY_ARRAY);
export const selectHiddenPostsStatus = (s) => (s?.taggedPosts?.hidden?.status || 'idle');
export const selectHiddenPostsError = (s) => s?.taggedPosts?.hidden?.error || null;
// Hidden tagged IDs selectors
export const selectHiddenTaggedIdsMap = (s) =>
    s?.taggedPosts?.hiddenIds?.map || {};

export const selectIsTaggedHidden = (s, postId) =>
    Boolean(selectHiddenTaggedIdsMap(s)[hidKey(postId)]);

export const selectHiddenTaggedIdsStatus = (s) =>
    s?.taggedPosts?.hiddenIds?.status || 'idle';

export const selectHiddenTaggedIdsError = (s) =>
    s?.taggedPosts?.hiddenIds?.error || null;

