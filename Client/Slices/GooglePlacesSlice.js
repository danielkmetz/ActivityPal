import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { updateNearbySuggestions } from "../utils/posts/UpdateNearbySuggestions";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const PHOTO_PREFETCH_MAX = 25;

function pickPhotosToResolve({ places, cache, limit }) {
  const photos = [];
  const seen = new Set();

  for (const p of places) {
    if (photos.length >= limit) break;

    const name = String(p?.photoName || "").trim();
    if (!name || seen.has(name)) continue;
    if (p?.photoUrl) continue;

    const cached = cache[name];
    if (cached?.status === "pending" || cached?.status === "resolved" || cached?.status === "failed") continue;

    seen.add(name);
    photos.push({ name, max: 400 });
  }

  return photos;
}

export const resolvePlacePhotos = createAsyncThunk(
  "GooglePlaces/resolvePlacePhotos",
  async ({ photos }, { rejectWithValue }) => {
    try {
      const r = await axios.post(`${BASE_URL}/places2/place-photos/resolve`, { photos });
      return r.data.items; // [{name, url}]
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

export const fetchGooglePlaces = createAsyncThunk(
  "GooglePlaces/fetchGooglePlaces",
  async (
    { lat, lng, activityType, quickFilter, radius, budget, page = 1, perPage = 10 },
    { rejectWithValue, signal, dispatch, getState }
  ) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/places2/places-nearby`,
        { lat, lng, activityType, quickFilter, radius, budget, page, perPage },
        { signal }
      );

      const places = response.data?.curatedPlaces || [];
      const meta = response.data?.meta || null;

      const cache = getState().GooglePlaces?.photoCache || {};
      const limit = Math.min(PHOTO_PREFETCH_MAX, perPage * 2);

      const photosToResolve = pickPhotosToResolve({ places, cache, limit });
      if (photosToResolve.length) {
        dispatch(resolvePlacePhotos({ photos: photosToResolve }));
      }

      return { places, meta, page, perPage };
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

export const fetchDining = createAsyncThunk(
  "GooglePlaces/fetchDining",
  async (
    { lat, lng, activityType, radius, budget, isCustom, cursor = null, perPage = 15 },
    { rejectWithValue, dispatch, getState }
  ) => {
    try {
      const body = cursor
        ? { cursor, perPage }
        : { lat, lng, activityType, radius, budget, isCustom, perPage };

      const response = await axios.post(`${BASE_URL}/google/places`, body);

      const places = response.data?.curatedPlaces || [];
      const meta = response.data?.meta || { cursor: null, perPage, hasMore: false };

      const cache = getState().GooglePlaces?.photoCache || {};
      const limit = Math.min(PHOTO_PREFETCH_MAX, perPage * 2);

      const photosToResolve = pickPhotosToResolve({ places, cache, limit });
      if (photosToResolve.length) {
        dispatch(resolvePlacePhotos({ photos: photosToResolve }));
      }

      return {
        places,
        meta,
        append: !!cursor, // cursor means "load more"
        perPage,
        // Only set/refresh lastQuery on fresh search
        query: cursor ? null : { lat, lng, activityType, radius, budget, isCustom, perPage },
      };
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

export const fetchNearbyPromosAndEvents = createAsyncThunk(
  "GooglePlaces/fetchNearbyPromosAndEvents",
  async ({ lat, lng, userId }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/places2/events-and-promos-nearby`, {
        lat,
        lng,
        userId,
      });
      return response.data.suggestions;
    } catch (error) {
      return rejectWithValue(error.response?.data || "Unknown error");
    }
  }
);

const initialState = {
  // places list + server paging
  curatedPlaces: [],
  photoCache: {},
  meta: null,          // { page, perPage, total }
  page: 1,
  lastQuery: null,     // { lat, lng, activityType, quickFilter, radius, budget, perPage }
  loadingMore: false,

  // other stuff you already have
  nearbySuggestions: [],
  placesStatus: "idle",
  promosStatus: "idle",
  error: null,
};

const GooglePlacesSlice = createSlice({
  name: "GooglePlaces",
  initialState,
  reducers: {
    clearGooglePlaces: (state) => {
      state.curatedPlaces = [];
      state.photoCache = {};
      state.meta = null;
      state.page = 1;
      state.lastQuery = null;
      state.loadingMore = false;
      state.placesStatus = "idle";
      state.error = null;
    },
    clearNearbySuggestions: (state) => {
      state.nearbySuggestions = [];
    },
    updateNearbySuggestionLikes: (state, action) => {
      const { postId, likes } = action.payload;
      const index = state.nearbySuggestions.findIndex((s) => s._id === postId);
      if (index !== -1) state.nearbySuggestions[index].likes = likes;
    },
    applyNearbyUpdates: (state, action) => {
      const { postId, updates, debug, label } = action.payload || {};
      if (!postId || !updates) return;
      updateNearbySuggestions({ state, postId, updates, debug, label });
    },
  },
  extraReducers: (builder) => {
    builder
      // ------- GOOGLE PLACES (server paged) -------
      .addCase(fetchGooglePlaces.pending, (state, action) => {
        const reqPage = action.meta.arg?.page || 1;
        state.error = null;

        if (reqPage > 1) {
          state.loadingMore = true;
        } else {
          state.placesStatus = "loading";
          state.loadingMore = false;
        }
      })
      .addCase(fetchGooglePlaces.fulfilled, (state, action) => {
        const { places, meta, page, perPage } = action.payload || {};

        state.meta = meta || null;
        state.page = page || 1;
        state.loadingMore = false;
        state.placesStatus = "succeeded";

        const { lat, lng, activityType, quickFilter, radius, budget } = action.meta.arg || {};
        state.lastQuery = { lat, lng, activityType, quickFilter, radius, budget, perPage };

        if ((page || 1) === 1) {
          state.curatedPlaces = Array.isArray(places) ? places : [];
          return;
        }

        // append + dedupe
        const existing = Array.isArray(state.curatedPlaces) ? state.curatedPlaces : [];
        const seen = new Set(existing.map((p) => p?.place_id).filter(Boolean));
        const incoming = Array.isArray(places) ? places : [];

        for (const p of incoming) {
          const id = p?.place_id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          existing.push(p);
        }

        state.curatedPlaces = existing;
      })
      .addCase(fetchGooglePlaces.rejected, (state, action) => {
        state.placesStatus = "failed";
        state.loadingMore = false;
        state.error = action.payload || "Failed to fetch curated places";
      })
      // ------- DINING (server paged) -------
      .addCase(fetchDining.pending, (state, action) => {
        const isAppend = !!action.meta.arg?.cursor;
        state.error = null;

        if (isAppend) {
          state.loadingMore = true;
        } else {
          state.placesStatus = "loading";
          state.loadingMore = false;
        }
      })
      .addCase(fetchDining.fulfilled, (state, action) => {
        const { places, meta, append, query } = action.payload || {};

        state.meta = meta || null;
        state.loadingMore = false;
        state.placesStatus = "succeeded";

        // Only update lastQuery on a fresh search (no cursor)
        if (query) state.lastQuery = query;

        if (!append) {
          state.curatedPlaces = Array.isArray(places) ? places : [];
          return;
        }

        // append + dedupe
        const existing = Array.isArray(state.curatedPlaces) ? state.curatedPlaces : [];
        const seen = new Set(existing.map((p) => p?.place_id).filter(Boolean));
        const incoming = Array.isArray(places) ? places : [];

        for (const p of incoming) {
          const id = p?.place_id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          existing.push(p);
        }

        state.curatedPlaces = existing;
      })
      .addCase(fetchDining.rejected, (state, action) => {
        state.placesStatus = "failed";
        state.loadingMore = false;
        state.error = action.payload || "Failed to fetch curated places";
      })
      // ------- PROMOS / EVENTS -------
      .addCase(fetchNearbyPromosAndEvents.pending, (state) => {
        state.promosStatus = "loading";
        state.error = null;
      })
      .addCase(fetchNearbyPromosAndEvents.fulfilled, (state, action) => {
        state.promosStatus = "succeeded";
        state.nearbySuggestions = action.payload;
      })
      .addCase(fetchNearbyPromosAndEvents.rejected, (state, action) => {
        state.promosStatus = "failed";
        state.error = action.payload || "Failed to fetch promos/events";
      })
      // ------- PHOTO RESOLUTION -------
      .addCase(resolvePlacePhotos.pending, (state, action) => {
        const photos = Array.isArray(action.meta?.arg?.photos) ? action.meta.arg.photos : [];
        const now = Date.now();
        for (const p of photos) {
          const name = String(p?.name || "").trim();
          if (!name) continue;
          const existing = state.photoCache[name];
          // don't downgrade resolved
          if (existing?.status === "resolved") continue;
          state.photoCache[name] = { url: existing?.url || null, status: "pending", ts: now };
        }
      })
      .addCase(resolvePlacePhotos.fulfilled, (state, action) => {
        const items = Array.isArray(action.payload) ? action.payload : [];
        const now = Date.now();

        for (const it of items) {
          const name = String(it?.name || "").trim();
          if (!name) continue;

          // IMPORTANT: treat url:null as "resolved" unless you want explicit retries
          state.photoCache[name] = { url: it?.url || null, status: "resolved", ts: now };
        }

        // Optional: hydrate curatedPlaces from cache (so UI updates)
        state.curatedPlaces = (state.curatedPlaces || []).map((p) => {
          const name = p?.photoName;
          if (!name) return p;
          if (p.photoUrl) return p;

          const cached = state.photoCache[name];
          if (!cached || cached.status !== "resolved") return p;

          return cached.url ? { ...p, photoUrl: cached.url } : { ...p, photoResolved: true };
        });
      })
      .addCase(resolvePlacePhotos.rejected, (state, action) => {
        const photos = Array.isArray(action.meta?.arg?.photos) ? action.meta.arg.photos : [];
        const now = Date.now();
        for (const p of photos) {
          const name = String(p?.name || "").trim();
          if (!name) continue;
          const existing = state.photoCache[name];
          if (existing?.status === "resolved") continue;
          state.photoCache[name] = { url: existing?.url || null, status: "failed", ts: now };
        }
      })
  },
});

export const {
  clearGooglePlaces,
  clearNearbySuggestions,
  updateNearbySuggestionLikes,
  applyNearbyUpdates,
} = GooglePlacesSlice.actions;

export const selectGooglePlaces = (state) => state.GooglePlaces?.curatedPlaces || [];
export const selectGoogleStatus = (state) => state.GooglePlaces?.placesStatus || "idle";
export const selectEventPromosStatus = (state) => state.GooglePlaces?.promosStatus || "Idle";
export const selectGoogleMeta = (state) => state.GooglePlaces?.meta || null;
export const selectGooglePage = (state) => state.GooglePlaces?.page || 1;
export const selectGoogleLastQuery = (state) => state.GooglePlaces?.lastQuery || null;
export const selectGoogleLoadingMore = (state) => !!state.GooglePlaces?.loadingMore;
export const selectNearbySuggestions = (state) => state.GooglePlaces?.nearbySuggestions || [];
export const selectGoogleHasMore = (state) => !!state.GooglePlaces?.meta?.hasMore;
export const selectGoogleCursor = (state) => state.GooglePlaces?.meta?.cursor || null;
export const selectNearbySuggestionById = (state, id) =>
  (state.GooglePlaces?.nearbySuggestions || []).find((item) => item._id === id);

export default GooglePlacesSlice.reducer;
