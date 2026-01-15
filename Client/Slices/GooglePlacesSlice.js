import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { updateNearbySuggestions } from "../utils/posts/UpdateNearbySuggestions";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

export const fetchGooglePlaces = createAsyncThunk(
  "GooglePlaces/fetchGooglePlaces",
  async (
    { lat, lng, activityType, quickFilter, radius, budget, page = 1, perPage = 10 },
    { rejectWithValue, signal }
  ) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/places2/places-nearby`,
        { lat, lng, activityType, quickFilter, radius, budget, page, perPage },
        { signal }
      );

      return {
        places: response.data.curatedPlaces || [],
        meta: response.data.meta || null,
        page,
        perPage,
      };
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

export const fetchDining = createAsyncThunk(
  "GooglePlaces/fetchDining",
  async (
    { lat, lng, activityType, radius, budget, isCustom, page = 1, perPage = 15 },
    { rejectWithValue }
  ) => {
    try {
      const response = await axios.post(`${BASE_URL}/google/places`, {
        lat,
        lng,
        activityType,
        radius,
        budget,
        isCustom,
        page,
        perPage,
      });

      return {
        places: response.data?.curatedPlaces || [],
        meta: response.data?.meta || { page, perPage, total: null },
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

const initialState = {
  // places list + server paging
  curatedPlaces: [],
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
        const reqPage = action.meta.arg?.page || 1;
        state.error = null;

        if (reqPage > 1) {
          state.loadingMore = true;
        } else {
          state.placesStatus = "loading";
          state.loadingMore = false;
        }
      })
      .addCase(fetchDining.fulfilled, (state, action) => {
        const { places, meta } = action.payload || {};
        const page = meta?.page || action.meta.arg?.page || 1;
        const perPage = meta?.perPage || action.meta.arg?.perPage || 15;

        state.meta = meta || null;
        state.page = page;
        state.loadingMore = false;
        state.placesStatus = "succeeded";

        const { lat, lng, activityType, radius, budget, isCustom } = action.meta.arg || {};
        state.lastQuery = { lat, lng, activityType, radius, budget, isCustom, perPage };

        if (page === 1) {
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
      .addCase(resolvePlacePhotos.fulfilled, (state, action) => {
        const items = Array.isArray(action.payload) ? action.payload : [];
        const map = new Map(items.map(x => [x.name, x.url]));

        state.curatedPlaces = (state.curatedPlaces || []).map(p => {
          if (!p?.photoName || p.photoUrl) return p;
          const url = map.get(p.photoName);
          return url ? { ...p, photoUrl: url } : p;
        });
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
export const selectNearbySuggestionById = (state, id) =>
  (state.GooglePlaces?.nearbySuggestions || []).find((item) => item._id === id);

export default GooglePlacesSlice.reducer;
