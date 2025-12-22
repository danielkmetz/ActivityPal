import { createSlice, createAsyncThunk, createSelector } from "@reduxjs/toolkit";
import api from "../api";

const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const extractErr = (err, fallback) => {
  const msg =
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    fallback;
  return typeof msg === "string" ? msg : fallback;
};

export const fetchPlaceThumbnail = createAsyncThunk(
  "placePhotos/fetchPlaceThumbnail",
  async (placeId, { signal, rejectWithValue }) => {
    try {
      if (!placeId) return rejectWithValue("Missing placeId");

      const res = await api.get(`/api/place-photos/thumbnail`, {
        params: { placeId },
        signal, // axios v1+ supports AbortController signal
      });

      const url = res?.data?.url ?? null; // can be null (no photo)
      return { placeId, url, fetchedAt: Date.now() };
    } catch (err) {
      if (signal?.aborted) return rejectWithValue("aborted");
      return rejectWithValue(extractErr(err, "Failed to fetch place thumbnail"));
    }
  },
  {
    condition: (placeId, { getState }) => {
      if (!placeId) return false;

      const state = getState()?.placePhotos;
      const entry = state?.byPlaceId?.[placeId];
      const inFlight = !!state?.inFlight?.[placeId];

      if (inFlight) return false; // ✅ dedupe

      if (entry?.fetchedAt && Date.now() - entry.fetchedAt < TTL_MS) {
        return false; // ✅ fresh cache (including url:null)
      }

      return true;
    },
  }
);

export const fetchPlaceThumbnailsBatch = createAsyncThunk(
  "placePhotos/fetchPlaceThumbnailsBatch",
  async (placeIds, { signal, rejectWithValue }) => {
    try {
      const ids = Array.isArray(placeIds) ? placeIds.filter(Boolean) : [];
      if (ids.length === 0) return { results: {}, fetchedAt: Date.now() };

      const res = await api.post(
        `/api/place-photos/thumbnails`,
        { placeIds: ids },
        { signal }
      );

      const results = res?.data?.results && typeof res.data.results === "object"
        ? res.data.results
        : {};

      return { results, fetchedAt: Date.now() };
    } catch (err) {
      if (signal?.aborted) return rejectWithValue("aborted");
      return rejectWithValue(extractErr(err, "Failed to fetch thumbnails batch"));
    }
  },
  {
    condition: (placeIds, { getState }) => {
      const ids = Array.isArray(placeIds) ? placeIds.filter(Boolean) : [];
      if (ids.length === 0) return false;

      const state = getState()?.placePhotos;
      if (!state) return true;

      const now = Date.now();

      return ids.some((id) => {
        if (!id) return false;
        if (state.inFlight?.[id]) return false; // ignore; already fetching

        const entry = state.byPlaceId?.[id];
        if (!entry?.fetchedAt) return true;
        return now - entry.fetchedAt >= TTL_MS;
      });
    },
  }
);

const placePhotosSlice = createSlice({
  name: "placePhotos",
  initialState: {
    byPlaceId: {
      // [placeId]: { url: string|null, fetchedAt: number }
    },
    inFlight: {
      // [placeId]: true
    },
    errorByPlaceId: {
      // [placeId]: "message"
    },
  },
  reducers: {
    resetPlacePhotos: (state) => {
      state.byPlaceId = {};
      state.inFlight = {};
      state.errorByPlaceId = {};
    },
    // Optional: if you ever want to force-refresh one
    invalidatePlacePhoto: (state, action) => {
      const placeId = action.payload;
      if (!placeId) return;
      delete state.byPlaceId[placeId];
      delete state.errorByPlaceId[placeId];
      delete state.inFlight[placeId];
    },
    mergePlaceThumbnails: (state, action) => {
      const { results, fetchedAt } = action.payload || {};
      const ts = fetchedAt ?? Date.now();
      if (!results || typeof results !== "object") return;

      for (const [placeId, url] of Object.entries(results)) {
        if (!placeId) continue;

        state.byPlaceId[placeId] = {
          url: url ?? null,     // IMPORTANT: keep null as “known no photo”
          fetchedAt: ts,
        };

        delete state.inFlight[placeId];
        delete state.errorByPlaceId[placeId];
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlaceThumbnail.pending, (state, action) => {
        const placeId = action.meta.arg;
        if (!placeId) return;
        state.inFlight[placeId] = true;
        delete state.errorByPlaceId[placeId];
      })
      .addCase(fetchPlaceThumbnail.fulfilled, (state, action) => {
        const { placeId, url, fetchedAt } = action.payload || {};
        if (!placeId) return;

        state.byPlaceId[placeId] = {
          url: url ?? null,
          fetchedAt: fetchedAt ?? Date.now(),
        };
        delete state.inFlight[placeId];
        delete state.errorByPlaceId[placeId];
      })
      .addCase(fetchPlaceThumbnail.rejected, (state, action) => {
        const placeId = action.meta.arg;
        if (!placeId) return;

        delete state.inFlight[placeId];

        const msg = action.payload || action.error?.message || "Failed";
        if (msg !== "aborted") state.errorByPlaceId[placeId] = msg;
      })
      .addCase(fetchPlaceThumbnailsBatch.pending, (state, action) => {
        const ids = Array.isArray(action.meta.arg) ? action.meta.arg : [];
        ids.forEach((placeId) => {
          if (!placeId) return;
          state.inFlight[placeId] = true;
          delete state.errorByPlaceId[placeId];
        });
      })
      .addCase(fetchPlaceThumbnailsBatch.fulfilled, (state, action) => {
        const { results, fetchedAt } = action.payload || {};
        const ts = fetchedAt ?? Date.now();

        Object.entries(results || {}).forEach(([placeId, url]) => {
          state.byPlaceId[placeId] = { url: url ?? null, fetchedAt: ts };
          delete state.inFlight[placeId];
          delete state.errorByPlaceId[placeId];
        });

        // clear inflight for any requested ids not returned (defensive)
        const ids = Array.isArray(action.meta.arg) ? action.meta.arg : [];
        ids.forEach((placeId) => delete state.inFlight[placeId]);
      })
      .addCase(fetchPlaceThumbnailsBatch.rejected, (state, action) => {
        const ids = Array.isArray(action.meta.arg) ? action.meta.arg : [];
        const msg = action.payload || action.error?.message || "Failed";

        ids.forEach((placeId) => {
          delete state.inFlight[placeId];
          if (msg !== "aborted") state.errorByPlaceId[placeId] = msg;
        });
      });
  },
});

export default placePhotosSlice.reducer;
export const { resetPlacePhotos, invalidatePlacePhoto, mergePlaceThumbnails } = placePhotosSlice.actions;
export const selectPlacePhotosById = (state) => state.placePhotos.byPlaceId || {};
export const makeSelectThumbnailUrl = (placeId) => (state) =>
  state.placePhotos.byPlaceId?.[placeId]?.url ?? null;
