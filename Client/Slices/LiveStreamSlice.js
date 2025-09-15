import { createSlice, createAsyncThunk, createEntityAdapter, createSelector, createAction } from '@reduxjs/toolkit';
import axios from 'axios';
import { getAuthHeaders } from '../utils/Authorization/getAuthHeaders';
import { pushSharedPostToUserAndFriends } from './ReviewsSlice';
import { updateSharedPostInReviews } from './ReviewsSlice';

const API = `${process.env.EXPO_PUBLIC_SERVER_URL}/liveStream`;

/* ------------------------------------------------------------------ */
/* Entity adapter: "who's live" list                                   */
/* ------------------------------------------------------------------ */
const liveAdapter = createEntityAdapter({
  selectId: (item) => item._id || item.id,
  sortComparer: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
});

/* ------------------------------------------------------------------ */
/* Thunks                                                              */
/* ------------------------------------------------------------------ */

// Paginated “Who’s live” rail (placeId optional)
export const fetchLiveNow = createAsyncThunk(
  'live/fetchLiveNow',
  async ({ placeId, limit = 30, cursor } = {}, { rejectWithValue }) => {
    try {
      const auth = await getAuthHeaders();
      const { data } = await axios.get(`${API}/live/now`, {
        ...auth,
        params: { placeId, limit, cursor },
      });
      const items = Array.isArray(data) ? data : data?.items || [];
      const nextCursor = data?.nextCursor || null;
      return { items, nextCursor, placeId: placeId || null };
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || 'Failed to load live streams');
    }
  }
);

// Start live session -> returns { rtmpUrl, streamKey, liveId, playbackUrl }
export const startLiveSession = createAsyncThunk(
  'live/start',
  async (args = {}, { rejectWithValue }) => {
    try {
      const { title, placeId } = args || {};
      const auth = await getAuthHeaders();
      const payload = {};
      if (title) payload.title = title;
      if (placeId) payload.placeId = placeId;

      const { data } = await axios.post(`${API}/live/start`, payload, auth);

      // Defensive normalize
      const streamKey =
        typeof data.streamKey === 'string'
          ? data.streamKey
          : (data.streamKey?.value || data.key || data.stream_key || null);

      const result = {
        ...data,
        streamKey,
      };

      return result;
    } catch (e) {
      return rejectWithValue(
        e?.response?.data?.message || e?.message || 'Failed to start live'
      );
    }
  }
);

// Stop live session
export const stopLiveSession = createAsyncThunk(
  'live/stop',
  async ({ liveId }, { rejectWithValue }) => {
    try {
      if (!liveId) throw new Error('Missing liveId');
      const auth = await getAuthHeaders();
      const { data } = await axios.post(`${API}/live/stop`, { id: liveId }, auth);
      return { ok: !!data?.ok, liveId };
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed to stop live');
    }
  }
);

// Fetch replay for a specific session (keyed by liveId)
export const fetchReplay = createAsyncThunk(
  'live/fetchReplay',
  async (liveId, { rejectWithValue }) => {
    const trace = `fetchReplay:${liveId}:${Date.now()}`;
    try {
      const auth = await getAuthHeaders();
      const url = `${API}/live/replay/${liveId}`;
      const { data, status } = await axios.get(url, auth);
      return { liveId, data }; // { ready, playbackUrl, ... }
    } catch (e) {
      const payload = e?.response?.data || {};
      const msg = payload?.message || e?.message || 'Failed to fetch replay';
      return rejectWithValue({ liveId, message: msg });
    }
  }
);

export const postLiveSession = createAsyncThunk(
  'live/post',
  async ({ liveId, isPosted = true, visibility, postId, caption } = {}, { dispatch, rejectWithValue }) => {
    try {
      if (!liveId) throw new Error('Missing liveId');

      const auth = await getAuthHeaders();
      
      const body = { isPosted, caption };
      if (visibility) body.visibility = visibility;
      if (postId !== undefined) body.postId = postId;

      
      const { data } = await axios.post(`${API}/live/${liveId}/post`, body, auth);
      
      if (data && typeof data === 'object') {
        if (data.success === true && data.data) {
          dispatch(pushSharedPostToUserAndFriends(data.data));
          return data.data;
        }
        if (data.ok !== undefined) {
          return {
            _id: data.id,
            userId: null,
            placeId: null,
            fullName: null,
            message: null,
            profilePic: null,
            profilePicUrl: null,
            taggedUsers: [],
            date: Date.now(),
            photos: [],
            type: 'liveStream',
            visibility: data.visibility ?? null,
            isPosted: !!data.isPosted,
            postId: data.postId ?? null,
            caption: data.caption,
          };
        }
      }

      throw new Error('Unexpected response shape');
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed to post live');
    }
  }
);

export const unpostLiveSession = createAsyncThunk(
  'live/unpost',
  async ({ liveId, removeLinkedPost = true } = {}, { rejectWithValue }) => {
    try {
      if (!liveId) throw new Error('Missing liveId');
      const auth = await getAuthHeaders();
      const { data } = await axios.post(
        `${API}/live/${liveId}/unpost`,
        { removeLinkedPost },
        auth
      );

      // Expected new shape: { success: true, data: {...} }
      if (data && data.success === true && data.data) {
        return data.data; // {_id, isPosted:false, postId:null, visibility, ...}
      }

      // Fallback / unexpected shape
      throw new Error('Unexpected response shape');
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed to unpost live');
    }
  }
);

// Thunk: edit live stream caption
export const editLiveCaption = createAsyncThunk(
  'live/editCaption',
  async ({ liveId, caption } = {}, { dispatch, rejectWithValue }) => {
    try {
      if (!liveId) throw new Error('Missing liveId');
      const auth = await getAuthHeaders();
      const { data } = await axios.patch(`${API}/live/${liveId}/caption`, { caption }, auth);

      if (data?.success && data?.data) {
        const p = data.data; // {_id, caption, ...}

        // ✅ Update the central posts store (ReviewsSlice) using your helper
        dispatch(updateSharedPostInReviews({
          postId: p._id,
          updates: { caption: p.caption ?? null },
        }));

        return p;
      }
      throw new Error('Unexpected response shape');
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed to update caption');
    }
  }
);

// --- Thunk: toggle like/unlike on a live stream ---
export const toggleLiveLike = createAsyncThunk(
  'live/toggleLike',
  async ({ liveId }, { getState, dispatch, rejectWithValue }) => {
    try {
      if (!liveId) throw new Error('Missing liveId');
      const auth = await getAuthHeaders();
      const { data } = await axios.post(`${API}/live/${liveId}/like`, {}, auth);

      // Expected shape: { success: true, liked: boolean, likesCount: number, likes: Like[] }
      if (!data || data.success !== true) {
        throw new Error('Unexpected response shape');
      }

      // Keep the central feed (ReviewsSlice) in sync if this live stream is posted to the feed
      try {
        dispatch(updateSharedPostInReviews({
          postId: liveId,
          updates: {
            __updatePostLikes: data.likes,
          },
        }));
      } catch (_) { }

      return {
        liveId,
        liked: !!data.liked,
        likes: Array.isArray(data.likes) ? data.likes : [],
        likesCount: typeof data.likesCount === 'number' ? data.likesCount : (Array.isArray(data.likes) ? data.likes.length : 0),
      };
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed to like/unlike stream');
    }
  }
);

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */
export const clearCurrentLive = createAction('live/clear');
export const clearReplay = createAction('live/clearReplay'); // payload: liveId

/* ------------------------------------------------------------------ */
/* Slice                                                               */
/* ------------------------------------------------------------------ */
const liveStreamSlice = createSlice({
  name: 'live',
  initialState: liveAdapter.getInitialState({
    status: 'idle',          // 'idle' | 'loading' | 'refreshing' | 'succeeded' | 'failed'
    error: null,
    nextCursor: null,
    activeFilter: null,      // placeId filter (optional)
    starting: 'idle',
    startError: null,
    stopping: 'idle',
    stopError: null,
    currentLive: null,       // { liveId, rtmpUrl, streamKey, playbackUrl? }
    // Replays keyed by liveId to avoid cross-session collisions
    replaysById: {},         // { [liveId]: { status, ready, playbackUrl, error, ...raw } }
    postingById: {},
    viewerCounts: {},
  }),
  reducers: {
    // for socket/webhook pushes
    upsertLive(state, action) {
      liveAdapter.upsertOne(state, action.payload);
    },
    removeLive(state, action) {
      const id = action.payload;
      liveAdapter.removeOne(state, id);
      // tidy up keyed maps so UI doesn’t show stale counts/spinners
      if (state.viewerCounts) delete state.viewerCounts[id];
      if (state.replaysById) delete state.replaysById[id];
      if (state.postingById) delete state.postingById[id];
      // if the host is removing their current session
      if (state.currentLive?.liveId === id) state.currentLive = null;
    },
    clearLive(state) {
      liveAdapter.removeAll(state);
      state.status = 'idle';
      state.error = null;
      state.nextCursor = null;
      state.activeFilter = null;
      state.viewerCounts = {};
    },
    setFilter(state, action) {
      state.activeFilter = action.payload || null; // can be null (no place filter)
    },
    setViewerCount(state, action) {
      const { liveStreamId, count } = action.payload || {};
      if (!liveStreamId) return;
      if (!state.viewerCounts) state.viewerCounts = {};
      state.viewerCounts[liveStreamId] = Math.max(0, Number(count) || 0);
    },
  },
  extraReducers: (builder) => {
    /* ------- fetchLiveNow ------- */
    builder
      .addCase(fetchLiveNow.pending, (state) => {
        state.status = state.status === 'succeeded' ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchLiveNow.fulfilled, (state, action) => {
        const { items, nextCursor, placeId } = action.payload || {};
        const sameFilter = (state.activeFilter || null) === (placeId || null);

        if (!sameFilter || state.status === 'loading') {
          liveAdapter.setAll(state, items);
        } else {
          liveAdapter.upsertMany(state, items);
        }
        state.activeFilter = placeId || null;
        state.nextCursor = nextCursor || null;
        state.status = 'succeeded';
      })
      .addCase(fetchLiveNow.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to load live streams';
      });

    /* ------- startLiveSession ------- */
    builder
      .addCase(startLiveSession.pending, (state) => {
        state.starting = 'loading';
        state.startError = null;
      })
      .addCase(startLiveSession.fulfilled, (state, action) => {
        state.starting = 'succeeded';
        const { liveId, rtmpUrl, streamKey, playbackUrl, live } = action.payload || {};
        state.currentLive = liveId ? { liveId, rtmpUrl, streamKey, playbackUrl, live } : null;
        // clear any stale replay entry for this id
        if (liveId) delete state.replaysById[liveId];
      })
      .addCase(startLiveSession.rejected, (state, action) => {
        state.starting = 'failed';
        state.startError = action.payload || 'Failed to start live';
        state.currentLive = null;
      });

    /* ------- stopLiveSession ------- */
    builder
      .addCase(stopLiveSession.pending, (state) => {
        state.stopping = 'loading';
        state.stopError = null;
      })
      .addCase(stopLiveSession.fulfilled, (state, action) => {
        state.stopping = 'succeeded';
        const id = action.payload?.liveId;
        if (id) liveAdapter.removeOne(state, id);
        state.currentLive = null;
        if (id && state.viewerCounts) delete state.viewerCounts[id];
      })
      .addCase(stopLiveSession.rejected, (state, action) => {
        state.stopping = 'failed';
        state.stopError = action.payload || 'Failed to stop live';
      });

    /* ------- fetchReplay (KEYED) ------- */
    builder
      .addCase(fetchReplay.pending, (state, action) => {
        const id = action.meta.arg;
        state.replaysById[id] = state.replaysById[id] || {};
        state.replaysById[id].status = 'loading';
        state.replaysById[id].error = null;
      })
      .addCase(fetchReplay.fulfilled, (state, action) => {
        const { liveId, data } = action.payload || {};
        state.replaysById[liveId] = {
          ...(state.replaysById[liveId] || {}),
          ...data, // expects { ready, playbackUrl, type, ... }
          status: 'succeeded',
          error: null,
        };
      })
      .addCase(fetchReplay.rejected, (state, action) => {
        const { liveId, message } = action.payload || {};
        if (!liveId) return;
        state.replaysById[liveId] = {
          ...(state.replaysById[liveId] || {}),
          status: 'failed',
          error: message || 'Failed to fetch replay',
        };
      })

      /* ------- misc actions ------- */
      .addCase(clearCurrentLive, (s) => {
        s.currentLive = null; // fixed: was s.current in old code
      })
      .addCase(clearReplay, (s, a) => {
        const id = a.payload;
        if (id) delete s.replaysById[id];
      });

    builder
      .addCase(postLiveSession.pending, (state, action) => {
        const { liveId } = action.meta.arg || {};
        if (!liveId) return;
        if (!state.postingById) state.postingById = {};       // 👈 guard
        state.postingById[liveId] = { status: 'loading', error: null };
      })
      .addCase(postLiveSession.fulfilled, (state, action) => {
        const p = action.payload || {};
        const id = p._id || p.id;                              // 👈 normalize
        if (!id) return;

        if (!state.postingById) state.postingById = {};        // 👈 guard

        // If the entity might not exist yet, consider upsertOne(state, p)
        liveAdapter.updateOne(state, {
          id,                                                  // 👈 not "_id"
          changes: {
            isPosted: !!p.isPosted,
            savedToProfile: !!p.isPosted,
            visibility: p.visibility || undefined,
            sharedPostId: p.postId ?? null,
          },
        });

        state.postingById[id] = { status: 'succeeded', error: null };
      })
      .addCase(postLiveSession.rejected, (state, action) => {
        const { liveId } = action.meta.arg || {};
        if (!liveId) return;
        if (!state.postingById) state.postingById = {};        // 👈 guard
        state.postingById[liveId] = { status: 'failed', error: action.payload || 'Failed to post live' };
      });

    /* ------- unpostLiveSession ------- */
    builder
      .addCase(unpostLiveSession.pending, (state, action) => {
        const { liveId } = action.meta.arg || {};
        if (!liveId) return;
        if (!state.postingById) state.postingById = {};
        state.postingById[liveId] = { status: 'loading', error: null };
      })
      .addCase(unpostLiveSession.fulfilled, (state, action) => {
        const p = action.payload || {};
        const id = p._id || p.id;
        if (!id) return;

        if (!state.postingById) state.postingById = {};

        // Update live entity flags; server already returns postId as null if it was cleared
        liveAdapter.updateOne(state, {
          id,
          changes: {
            isPosted: false,
            savedToProfile: false,
            visibility: p.visibility || undefined,
            sharedPostId: p.postId ?? null,
          },
        });

        state.postingById[id] = { status: 'succeeded', error: null };
      })
      .addCase(unpostLiveSession.rejected, (state, action) => {
        const { liveId } = action.meta.arg || {};
        if (!liveId) return;
        if (!state.postingById) state.postingById = {};
        state.postingById[liveId] = {
          status: 'failed',
          error: action.payload || 'Failed to unpost live',
        };
      });

    builder
      .addCase(editLiveCaption.pending, (state, action) => {
        const { liveId } = action.meta.arg || {};
        if (!liveId) return;
        if (!state.postingById) state.postingById = {};
        state.postingById[liveId] = { status: 'loading', error: null, op: 'caption' };
      })
      .addCase(editLiveCaption.fulfilled, (state, action) => {
        const p = action.payload || {};
        const id = p._id || p.id;
        if (!id) return;

        // If entity might not exist yet, consider upsertOne(state, p)
        liveAdapter.updateOne(state, {
          id,
          changes: {
            caption: p.caption ?? null,
          },
        });

        if (!state.postingById) state.postingById = {};
        state.postingById[id] = { status: 'succeeded', error: null, op: 'caption' };
      })
      .addCase(editLiveCaption.rejected, (state, action) => {
        const { liveId } = action.meta.arg || {};
        if (!liveId) return;
        if (!state.postingById) state.postingById = {};
        state.postingById[liveId] = {
          status: 'failed',
          error: action.payload || 'Failed to update caption',
          op: 'caption',
        };
      });

    /* ------- toggleLiveLike ------- */
    builder
      .addCase(toggleLiveLike.pending, (state, action) => {
        const { liveId } = action.meta.arg || {};
        if (!liveId) return;
        if (!state.postingById) state.postingById = {};
        state.postingById[liveId] = { status: 'loading', error: null, op: 'like' };
      })
      .addCase(toggleLiveLike.fulfilled, (state, action) => {
        const { liveId, liked, likes, likesCount } = action.payload || {};
        if (!liveId) return;

        // Upsert in case this entity isn't in the list yet
        liveAdapter.updateOne(state, {
          id: liveId,
          changes: {
            likedByMe: liked,
            likesCount,
            likes, // store the array if you keep it on the entity
          },
        });

        if (!state.postingById) state.postingById = {};
        state.postingById[liveId] = { status: 'succeeded', error: null, op: 'like' };
      })
      .addCase(toggleLiveLike.rejected, (state, action) => {
        const { liveId } = action.meta.arg || {};
        if (!liveId) return;
        if (!state.postingById) state.postingById = {};
        state.postingById[liveId] = {
          status: 'failed',
          error: action.payload || 'Failed to like/unlike stream',
          op: 'like',
        };
      });
  },
});

/* ------------------------------------------------------------------ */
/* Exports (reducers/actions)                                          */
/* ------------------------------------------------------------------ */
export const { upsertLive, removeLive, clearLive, setFilter, setViewerCount } = liveStreamSlice.actions;
export default liveStreamSlice.reducer;

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */
export const {
  selectAll: selectLiveNow,
  selectById: selectLiveById,
  selectIds: selectLiveIds,
  selectEntities: selectLiveEntities,
} = liveAdapter.getSelectors((state) => state.live);

export const selectLiveStatus = (state) => state.live.status;
export const selectLiveError = (state) => state.live.error;
export const selectNextCursor = (state) => state.live.nextCursor;
export const selectLiveFilter = (state) => state.live.activeFilter;
export const selectCurrentLive = (state) => state.live.currentLive;

export const EMPTY_REPLAY = Object.freeze({
  status: 'idle',
  ready: false,
  playbackUrl: null,
  error: null,
});

export const makeSelectReplayById =
  (liveId) =>
    (state) =>
      state.live.replaysById[liveId] || EMPTY_REPLAY;

export const selectStarting = (state) => state.live.starting;
export const selectStartError = (state) => state.live.startError;
export const selectStopping = (state) => state.live.stopping;
export const selectStopError = (state) => state.live.stopError;

/* Optional helper: filter current live rows by place */
export const makeSelectLiveByPlace = (placeId) =>
  createSelector([selectLiveNow], (items) => items.filter((x) => (placeId ? x.placeId === placeId : true)));

export const selectViewerCounts = (state) => state.live.viewerCounts || {};

export const makeSelectViewerCount =
  (liveId) =>
    (state) =>
      (state.live.viewerCounts && state.live.viewerCounts[liveId]) || 0;
