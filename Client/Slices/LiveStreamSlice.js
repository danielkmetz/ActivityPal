// Slices/LiveStreamSlice.js
import { createSlice, createAsyncThunk, createEntityAdapter, createSelector, createAction } from '@reduxjs/toolkit';
import axios from 'axios';
import { getAuthHeaders } from '../utils/Authorization/getAuthHeaders';

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
      return data; // { rtmpUrl, streamKey, liveId, playbackUrl }
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed to start live');
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
      console.log(`[${trace}] → GET ${url}`);
      const { data, status } = await axios.get(url, auth);
      console.log(`[${trace}] ← ${status}`, data);
      return { liveId, data }; // { ready, playbackUrl, ... }
    } catch (e) {
      const status = e?.response?.status;
      const payload = e?.response?.data || {};
      const msg = payload?.message || e?.message || 'Failed to fetch replay';
      console.warn(`[${trace}] ✖ ERROR status=${status}`, payload);
      return rejectWithValue({ liveId, message: msg });
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
const liveSlice = createSlice({
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
  }),
  reducers: {
    // for socket/webhook pushes
    upsertLive(state, action) {
      liveAdapter.upsertOne(state, action.payload);
    },
    removeLive(state, action) {
      liveAdapter.removeOne(state, action.payload);
    },
    clearLive(state) {
      liveAdapter.removeAll(state);
      state.status = 'idle';
      state.error = null;
      state.nextCursor = null;
      state.activeFilter = null;
    },
    setFilter(state, action) {
      state.activeFilter = action.payload || null; // can be null (no place filter)
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
        const { liveId, rtmpUrl, streamKey, playbackUrl } = action.payload || {};
        state.currentLive = liveId ? { liveId, rtmpUrl, streamKey, playbackUrl } : null;
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
  },
});

/* ------------------------------------------------------------------ */
/* Exports (reducers/actions)                                          */
/* ------------------------------------------------------------------ */
export const { upsertLive, removeLive, clearLive, setFilter } = liveSlice.actions;
export default liveSlice.reducer;

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

export const makeSelectReplayById =
  (liveId) =>
  (state) =>
    state.live.replaysById[liveId] || { status: 'idle', ready: false, playbackUrl: null, error: null };

export const selectStarting = (state) => state.live.starting;
export const selectStartError = (state) => state.live.startError;
export const selectStopping = (state) => state.live.stopping;
export const selectStopError = (state) => state.live.stopError;

/* Optional helper: filter current live rows by place */
export const makeSelectLiveByPlace = (placeId) =>
  createSelector([selectLiveNow], (items) => items.filter((x) => (placeId ? x.placeId === placeId : true)));
