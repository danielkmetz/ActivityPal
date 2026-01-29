import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { updateNearbySuggestions } from "../utils/posts/UpdateNearbySuggestions";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const PHOTO_PREFETCH_MAX = 25;

// ------------------------
// Helpers
// ------------------------
function pickPhotosToResolve({ places, cache, limit }) {
  const photos = [];
  const seen = new Set();

  const safePlaces = Array.isArray(places) ? places : [];
  const safeCache = cache && typeof cache === "object" ? cache : {};

  for (const p of safePlaces) {
    if (photos.length >= limit) break;

    const name = String(p?.photoName || "").trim();
    if (!name || seen.has(name)) continue;
    if (p?.photoUrl) continue;

    const cached = safeCache[name];
    if (
      cached?.status === "pending" ||
      cached?.status === "resolved" ||
      cached?.status === "failed"
    ) {
      continue;
    }

    seen.add(name);
    photos.push({ name, max: 400 });
  }

  return photos;
}

function computeHasMoreFallback({ meta, incomingCount, perPage }) {
  if (typeof meta?.hasMore === "boolean") return meta.hasMore;
  // fallback only (imperfect if server filters heavily)
  return incomingCount >= (perPage || 15);
}

function shouldUsePlaces2ForWhen(query) {
  const w = query?.when;
  // null/undefined = user didn't care, treat as "now-ish" for provider routing
  if (!w) return false;
  // only "now" can safely use dining pipeline
  return String(w).toLowerCase() !== "now";
}

function pickPlacesProvider(query) {
  const isFoodDrink = query?.placeCategory === "food_drink";
  // food/drink normally uses dining cursor pipeline,
  // BUT any future time must use places2 so we can align opening hours.
  if (isFoodDrink && !shouldUsePlaces2ForWhen(query)) return "dining";
  return "places2";
}

// ------------------------
// Photo resolution
// ------------------------
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

export const fetchPlacesPage = createAsyncThunk(
  "GooglePlaces/fetchPlacesPage",
  async ({ query, cursor = null, page = 1 }, { rejectWithValue, dispatch, getState, signal }) => {
    try {
      const perPage = query?.perPage || 15;
      const provider = pickPlacesProvider(query);

      let response;

      if (provider === "dining") {
        const body = cursor
          ? { cursor, perPage }
          : {
              lat: query.lat,
              lng: query.lng,
              activityType: "Dining",
              radius: query.radius,
              budget: query.budget,
              isCustom: query.source === "custom",
              perPage,

              when: query.when ?? null,
              customWhen: query.customWhen ?? null,
              // (optional) if you have it now:
              whenAtISO: query.whenAtISO ?? null,

              who: query.who,
              vibes: query.vibes,
              keyword: query.keyword,
              familyFriendly: query.familyFriendly,
              placesFilters: query.placesFilters,
              placeCategory: query.placeCategory,
            };

        response = await axios.post(`${BASE_URL}/google/places`, body, { signal });
      } else {
        const body = {
          lat: query.lat,
          lng: query.lng,
          radius: query.radius,
          budget: query.budget,
          page,
          perPage,

          quickFilter: query.quickFilter ?? null,
          activityType: query.activityType ?? null,
          placeCategory: query.placeCategory ?? null,

          when: query.when ?? null,
          customWhen: query.customWhen ?? null,
          // (optional) if you have it now:
          whenAtISO: query.whenAtISO ?? null,

          who: query.who,
          vibes: query.vibes,
          keyword: query.keyword,
          familyFriendly: query.familyFriendly,
          placesFilters: query.placesFilters,
        };

        response = await axios.post(`${BASE_URL}/places2/places-nearby`, body, { signal });
      }

      // LOG RAW RESPONSE SHAPE
      const data = response?.data;
      const curatedPlaces = Array.isArray(data?.curatedPlaces) ? data.curatedPlaces : null;
      const meta = data?.meta ?? null;

      const places = curatedPlaces || [];
      // photo prefetch only for places
      const cache = getState().GooglePlaces?.photoCache || {};
      const limit = Math.min(PHOTO_PREFETCH_MAX, perPage * 2);

      const photosToResolve = pickPhotosToResolve({ places, cache, limit });

      if (photosToResolve.length) {
        dispatch(resolvePlacePhotos({ photos: photosToResolve }));
      }

      return {
        places,
        meta,
        provider,
        append: !!cursor || page > 1,
        page,
        perPage,
      };
    } catch (err) {
      const status = err?.response?.status ?? null;
      const data = err?.response?.data ?? null;

      return rejectWithValue(data || err.message);
    }
  }
);

// ------------------------
// Events stream fetch (requires real endpoint)
// ------------------------
export const fetchEventsPage = createAsyncThunk(
  "GooglePlaces/fetchEventsPage",
  async ({ query, cursor = null, page = 1 }, { rejectWithValue, signal }) => {
    try {
      const perPage = query?.perPage || 15;

      const body = cursor
        ? { cursor, perPage }
        : {
          lat: query.lat,
          lng: query.lng,
          radius: query.radius,
          perPage,

          when: query.when,
          keyword: query.keyword,
          familyFriendly: query.familyFriendly,
          eventCategory: query.eventCategory,
          eventFilters: query.eventFilters,
        };

      const r = await axios.post(`${BASE_URL}/events/nearby`, body, { signal });

      const events = r.data?.items || [];
      const meta = r.data?.meta || null;

      return { events, meta, append: !!cursor || page > 1, page, perPage };
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

// ------------------------
// Promos/events overlay (your existing endpoint)
// ------------------------
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

// ------------------------
// State
// ------------------------
const initialState = {
  photoCache: {},
  lastSearch: null,
  error: null,
  places: {
    items: [],
    status: "idle",
    loadingMore: false,
    provider: "places2",
    page: 1,
    perPage: 15,
    cursor: null,
    hasMore: false,
    meta: null,
  },
  events: {
    items: [],
    status: "idle",
    loadingMore: false,
    page: 1,
    perPage: 15,
    cursor: null,
    hasMore: false,
    meta: null,
  },
  nearbySuggestions: [],
  promosStatus: "idle",
};

const GooglePlacesSlice = createSlice({
  name: "GooglePlaces",
  initialState,
  reducers: {
    clearGooglePlaces: (state) => {
      state.photoCache = {};
      state.lastSearch = null;
      state.error = null;
      state.places = { ...initialState.places };
      state.events = { ...initialState.events };
      state.nearbySuggestions = [];
      state.promosStatus = "idle";
    },
    // this is the reducer action the orchestration thunk uses
    startActivitiesSearch: (state, action) => {
      const query = action.payload || null;
      state.lastSearch = query;
      state.error = null;

      // IMPORTANT: do NOT wipe photoCache on new searches (better UX / perf)
      state.places = { ...initialState.places, perPage: query?.perPage || initialState.places.perPage };
      state.events = { ...initialState.events, perPage: query?.perPage || initialState.events.perPage };
    },
    clearNearbySuggestions: (state) => {
      state.nearbySuggestions = [];
    },
    updateNearbySuggestionLikes: (state, action) => {
      const { postId, likes } = action.payload || {};
      const arr = Array.isArray(state.nearbySuggestions) ? state.nearbySuggestions : [];
      const idx = arr.findIndex((s) => s?._id === postId);
      if (idx !== -1) arr[idx].likes = likes;
      state.nearbySuggestions = arr;
    },
    applyNearbyUpdates: (state, action) => {
      const { postId, updates, debug, label } = action.payload || {};
      if (!postId || !updates) return;
      updateNearbySuggestions({ state, postId, updates, debug, label });
    },
  },
  extraReducers: (builder) => {
    builder
      // ------------------------
      // Places stream
      // ------------------------
      .addCase(fetchPlacesPage.pending, (state, action) => {
        const isAppend = !!action.meta.arg?.cursor || (action.meta.arg?.page || 1) > 1;
        state.error = null;

        if (isAppend) {
          state.places.loadingMore = true;
        } else {
          state.places.status = "loading";
          state.places.loadingMore = false;
        }
      })
      .addCase(fetchPlacesPage.fulfilled, (state, action) => {
        const { places, meta, provider, append, page, perPage } = action.payload || {};

        const incoming = Array.isArray(places) ? places : [];
        state.places.status = "succeeded";
        state.places.loadingMore = false;
        state.places.meta = meta || null;
        state.places.provider = provider || state.places.provider;
        state.places.page = page || 1;
        state.places.perPage = perPage || state.places.perPage;

        if (provider === "dining") {
          state.places.cursor = meta?.cursor || null;
          state.places.hasMore = computeHasMoreFallback({
            meta,
            incomingCount: incoming.length,
            perPage: state.places.perPage,
          });
        } else {
          state.places.cursor = null;
          state.places.hasMore = computeHasMoreFallback({
            meta,
            incomingCount: incoming.length,
            perPage: state.places.perPage,
          });
        }

        if (!append) {
          state.places.items = incoming;
          return;
        }

        // append + dedupe
        const existing = Array.isArray(state.places.items) ? state.places.items : [];
        const seen = new Set(existing.map((p) => p?.place_id).filter(Boolean));

        for (const p of incoming) {
          const id = p?.place_id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          existing.push(p);
        }

        state.places.items = existing;
      })
      .addCase(fetchPlacesPage.rejected, (state, action) => {
        state.places.status = "failed";
        state.places.loadingMore = false;
        state.error = action.payload || "Failed to fetch places";
      })
      // ------------------------
      // Events stream
      // ------------------------
      .addCase(fetchEventsPage.pending, (state, action) => {
        const isAppend = !!action.meta.arg?.cursor || (action.meta.arg?.page || 1) > 1;
        state.error = null;

        if (isAppend) {
          state.events.loadingMore = true;
        } else {
          state.events.status = "loading";
          state.events.loadingMore = false;
        }
      })
      .addCase(fetchEventsPage.fulfilled, (state, action) => {
        const { events, meta, append, page, perPage } = action.payload || {};
        const incoming = Array.isArray(events) ? events : [];

        state.events.status = "succeeded";
        state.events.loadingMore = false;
        state.events.meta = meta || null;
        state.events.page = page || 1;
        state.events.perPage = perPage || state.events.perPage;

        state.events.cursor = meta?.cursor || null;
        state.events.hasMore = computeHasMoreFallback({
          meta,
          incomingCount: incoming.length,
          perPage: state.events.perPage,
        });

        if (!append) {
          state.events.items = incoming;
          return;
        }

        // append + dedupe (id depends on your event model)
        const existing = Array.isArray(state.events.items) ? state.events.items : [];
        const seen = new Set(existing.map((e) => e?.id || e?._id).filter(Boolean));

        for (const e of incoming) {
          const id = e?.id || e?._id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          existing.push(e);
        }

        state.events.items = existing;
      })
      .addCase(fetchEventsPage.rejected, (state, action) => {
        state.events.status = "failed";
        state.events.loadingMore = false;
        state.error = action.payload || "Failed to fetch events";
      })
      // ------------------------
      // Promos overlay
      // ------------------------
      .addCase(fetchNearbyPromosAndEvents.pending, (state) => {
        state.promosStatus = "loading";
        state.error = null;
      })
      .addCase(fetchNearbyPromosAndEvents.fulfilled, (state, action) => {
        state.promosStatus = "succeeded";
        state.nearbySuggestions = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchNearbyPromosAndEvents.rejected, (state, action) => {
        state.promosStatus = "failed";
        state.error = action.payload || "Failed to fetch promos/events";
      })
      // ------------------------
      // Photo resolution
      // ------------------------
      .addCase(resolvePlacePhotos.pending, (state, action) => {
        const photos = Array.isArray(action.meta?.arg?.photos) ? action.meta.arg.photos : [];
        const now = Date.now();

        for (const p of photos) {
          const name = String(p?.name || "").trim();
          if (!name) continue;

          const existing = state.photoCache[name];
          if (existing?.status === "resolved") continue;

          state.photoCache[name] = {
            url: existing?.url || null,
            status: "pending",
            ts: now,
          };
        }
      })
      .addCase(resolvePlacePhotos.fulfilled, (state, action) => {
        const items = Array.isArray(action.payload) ? action.payload : [];
        const now = Date.now();

        for (const it of items) {
          const name = String(it?.name || "").trim();
          if (!name) continue;

          state.photoCache[name] = {
            url: it?.url || null,
            status: "resolved",
            ts: now,
          };
        }

        // hydrate places.items so UI updates
        state.places.items = (Array.isArray(state.places.items) ? state.places.items : []).map((p) => {
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

          state.photoCache[name] = {
            url: existing?.url || null,
            status: "failed",
            ts: now,
          };
        }
      });
  },
});

export const {
  clearGooglePlaces,
  startActivitiesSearch: startActivitiesSearchAction,
  clearNearbySuggestions,
  updateNearbySuggestionLikes,
  applyNearbyUpdates,
} = GooglePlacesSlice.actions;

// ------------------------
// Orchestration thunks
// ------------------------
export const startActivitiesSearch = (query) => async (dispatch) => {
  dispatch(startActivitiesSearchAction(query));

  const mode = query?.mode || "places";
  const showPlaces = mode === "places" || mode === "mixed";
  const showEvents = mode === "events" || mode === "mixed";

  if (showPlaces) dispatch(fetchPlacesPage({ query, page: 1 }));
  if (showEvents) dispatch(fetchEventsPage({ query, page: 1 }));
};

export const loadMorePlaces = ({ lastSearch } = {}) => (dispatch, getState) => {
  const state = getState().GooglePlaces;
  const q = lastSearch || state.lastSearch;
  if (!q) return;

  const provider = pickPlacesProvider(q);

  if (provider === "dining") {
    const cursor = state.places?.cursor;
    if (!cursor) return;
    dispatch(fetchPlacesPage({ query: q, cursor }));
    return;
  }

  const nextPage = (state.places?.page || 1) + 1;
  dispatch(fetchPlacesPage({ query: q, page: nextPage }));
};

export const loadMoreEvents = ({ lastSearch } = {}) => (dispatch, getState) => {
  const state = getState().GooglePlaces;
  const q = lastSearch || state.lastSearch;
  if (!q) return;

  const cursor = state.events?.cursor;
  if (cursor) {
    dispatch(fetchEventsPage({ query: q, cursor }));
    return;
  }

  const nextPage = (state.events?.page || 1) + 1;
  dispatch(fetchEventsPage({ query: q, page: nextPage }));
};

// ------------------------
// Selectors (NEW)
// ------------------------
export const selectPlacesItems = (state) => state.GooglePlaces?.places?.items || [];
export const selectEventsItems = (state) => state.GooglePlaces?.events?.items || [];
export const selectPlacesStatus = (state) => state.GooglePlaces?.places?.status || "idle";
export const selectEventsStatus = (state) => state.GooglePlaces?.events?.status || "idle";
export const selectPlacesLoadingMore = (state) => !!state.GooglePlaces?.places?.loadingMore;
export const selectEventsLoadingMore = (state) => !!state.GooglePlaces?.events?.loadingMore;
export const selectPlacesHasMore = (state) => !!state.GooglePlaces?.places?.hasMore;
export const selectEventsHasMore = (state) => !!state.GooglePlaces?.events?.hasMore;
export const selectLastSearch = (state) => state.GooglePlaces?.lastSearch || null;
export const selectNearbySuggestions = (state) => state.GooglePlaces?.nearbySuggestions || [];
export const selectEventPromosStatus = (state) => state.GooglePlaces?.promosStatus || "idle";

export const selectGooglePlaces = (state) => state.GooglePlaces?.places || [];
export const selectGoogleStatus = (state) => state.GooglePlaces?.status || "idle";
export const selectGoogleMeta = (state) => state.GooglePlaces?.meta || null;
export const selectGooglePage = (state) => state.GooglePlaces?.page || 1;
export const selectGoogleLastQuery = (state) => state.GooglePlaces?.lastQuery || null;
export const selectGoogleLoadingMore = (state) => !!state.GooglePlaces?.loadingMore;

export default GooglePlacesSlice.reducer;
