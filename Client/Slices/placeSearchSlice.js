import { createSlice, createAsyncThunk, createSelector } from "@reduxjs/toolkit";
import { mergePlaceThumbnails } from "./PlacePhotosSlice";
import api from "../api";

const PREDICTIONS_TTL_MS = 1000 * 30;          // 30s is plenty for typing
const DETAILS_TTL_MS = 1000 * 60 * 60 * 24;    // 24h

const extractErr = (err, fallback = "Request failed") => {
  const msg =
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    fallback;
  return typeof msg === "string" ? msg : fallback;
};

const roundCoord = (n, p = 3) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const m = Math.pow(10, p);
  return Math.round(x * m) / m;
};

const buildQueryKey = ({ input, lat, lng }) => {
  const q = (input || "").trim().toLowerCase();
  const la = roundCoord(lat, 3);
  const ln = roundCoord(lng, 3);
  return `${q}::${la ?? "na"}::${ln ?? "na"}`;
};

const now = () => Date.now();

/**
 * Predictions
 * - Uses cache when fresh (still fulfills, no network)
 * - Dedupe identical in-flight queries
 * - Uses signal for abort
 * - Ignores stale responses
 */
export const fetchPlacePredictions = createAsyncThunk(
  "placeSearch/fetchPredictions",
  async ({ input, lat, lng }, { getState, dispatch, signal, rejectWithValue }) => {
    try {
      const q = (input || "").trim();
      if (q.length < 3) {
        // Keep payload shape consistent so reducers don't leak inFlight flags
        const queryKey = buildQueryKey({ input: q, lat, lng });
        return { queryKey, predictions: [] };
      }

      const queryKey = buildQueryKey({ input: q, lat, lng });

      const cached = getState()?.placeSearch?.predictionsCache?.[queryKey];
      if (cached && now() - cached.fetchedAt < PREDICTIONS_TTL_MS) {
        return { queryKey, predictions: cached.predictions || [] };
      }

      const res = await api.get(`/api/places/autocomplete`, {
        params: { input: q, lat, lng },
        signal,
      });

      const predictions = Array.isArray(res.data?.predictions) ? res.data.predictions : [];

      // ✅ NEW: seed thumbnails for top 5 immediately
      const thumbnails =
        res.data?.thumbnails && typeof res.data.thumbnails === "object"
          ? res.data.thumbnails
          : null;

      if (thumbnails) {
        dispatch(mergePlaceThumbnails({ results: thumbnails, fetchedAt: now() }));
      }

      return { queryKey, predictions };
    } catch (err) {
      if (signal?.aborted) return rejectWithValue({ aborted: true });
      return rejectWithValue({ message: extractErr(err, "Failed to fetch place predictions") });
    }
  },
  {
    condition: ({ input, lat, lng }, { getState }) => {
      const q = (input || "").trim();
      if (q.length < 3) return false;

      const state = getState()?.placeSearch;
      const queryKey = buildQueryKey({ input: q, lat, lng });

      if (state?.inFlightPredictions?.[queryKey]) return false;
      return true;
    },
  }
);

/**
 * Details
 * - Caches details by placeId (including null)
 * - Dedupe in-flight by placeId
 * - Uses signal for abort
 */
export const fetchPlaceDetails = createAsyncThunk(
  "placeSearch/fetchDetails",
  async (placeId, { getState, signal, rejectWithValue }) => {
    try {
      if (!placeId) return rejectWithValue({ message: "Missing placeId" });

      const existing = getState()?.placeSearch?.detailsByPlaceId?.[placeId];
      if (existing && now() - existing.fetchedAt < DETAILS_TTL_MS) {
        return { placeId, details: existing.details ?? null, fetchedAt: existing.fetchedAt, fromCache: true };
      }

      const res = await api.get(`/api/places/details`, { params: { placeId }, signal });
      const details = res.data?.result ?? null;

      return { placeId, details, fetchedAt: now(), fromCache: false };
    } catch (err) {
      if (signal?.aborted) return rejectWithValue({ aborted: true });
      return rejectWithValue({ message: extractErr(err, "Failed to fetch place details") });
    }
  },
  {
    condition: (placeId, { getState }) => {
      if (!placeId) return false;
      const state = getState()?.placeSearch;
      if (state?.inFlightDetails?.[placeId]) return false;
      return true;
    },
  }
);

const placeSearchSlice = createSlice({
  name: "placeSearch",
  initialState: {
    input: "",
    predictions: [],
    status: "idle", // idle | loading | succeeded | failed
    error: null,

    // helps prevent stale overwrite
    activePredictionsQueryKey: null,
    activePredictionsRequestId: null,

    // caches
    predictionsCache: {
      // [queryKey]: { predictions: [], fetchedAt }
    },
    detailsByPlaceId: {
      // [placeId]: { details: object|null, fetchedAt }
    },

    // dedupe maps
    inFlightPredictions: {
      // [queryKey]: true
    },
    inFlightDetails: {
      // [placeId]: true
    },
  },
  reducers: {
    clearPredictions: (state) => {
      state.predictions = [];
      state.status = "idle";
      state.error = null;
      state.activePredictionsQueryKey = null;
      state.activePredictionsRequestId = null;
      state.inFlightPredictions = {};
    },
    setInput: (state, action) => {
      state.input = action.payload || "";
    },
    // Optional: if you want a hard reset (ex: logout)
    resetPlaceSearch: (state) => {
      state.input = "";
      state.predictions = [];
      state.status = "idle";
      state.error = null;
      state.activePredictionsQueryKey = null;
      state.activePredictionsRequestId = null;
      state.predictionsCache = {};
      state.detailsByPlaceId = {};
      state.inFlightPredictions = {};
      state.inFlightDetails = {};
    },
  },
  extraReducers: (builder) => {
    builder
      // -------------------- Predictions --------------------
      .addCase(fetchPlacePredictions.pending, (state, action) => {
        const { input, lat, lng } = action.meta.arg || {};
        const q = (input || "").trim();
        const queryKey = buildQueryKey({ input: q, lat, lng });

        state.status = "loading";
        state.error = null;

        state.activePredictionsQueryKey = queryKey;
        state.activePredictionsRequestId = action.meta.requestId;

        state.inFlightPredictions[queryKey] = true;
      })
      .addCase(fetchPlacePredictions.fulfilled, (state, action) => {
        const reqId = action.meta.requestId;
        const { queryKey, predictions } = action.payload || {};

        // ✅ ignore stale responses
        if (state.activePredictionsRequestId !== reqId) {
          // still clear inflight for that key if it exists
          if (queryKey) delete state.inFlightPredictions[queryKey];
          return;
        }

        state.status = "succeeded";
        state.predictions = Array.isArray(predictions) ? predictions : [];

        if (queryKey) {
          state.predictionsCache[queryKey] = { predictions: state.predictions, fetchedAt: now() };
          delete state.inFlightPredictions[queryKey];
        }
      })
      .addCase(fetchPlacePredictions.rejected, (state, action) => {
        const reqId = action.meta.requestId;

        // if a newer request is active, ignore this one
        if (state.activePredictionsRequestId && state.activePredictionsRequestId !== reqId) return;

        state.status = "failed";
        const payload = action.payload;
        if (payload?.aborted) {
          // treat abort as neutral (don’t show errors)
          state.status = "idle";
          state.error = null;
        } else {
          state.error = payload?.message || action.error?.message || "Failed";
        }

        const { input, lat, lng } = action.meta.arg || {};
        const q = (input || "").trim();
        const queryKey = buildQueryKey({ input: q, lat, lng });
        delete state.inFlightPredictions[queryKey];
      })

      // -------------------- Details --------------------
      .addCase(fetchPlaceDetails.pending, (state, action) => {
        const placeId = action.meta.arg;
        if (!placeId) return;
        state.inFlightDetails[placeId] = true;
      })
      .addCase(fetchPlaceDetails.fulfilled, (state, action) => {
        const { placeId, details, fetchedAt } = action.payload || {};
        if (!placeId) return;

        state.detailsByPlaceId[placeId] = {
          details: details ?? null,
          fetchedAt: fetchedAt ?? now(),
        };
        delete state.inFlightDetails[placeId];
      })
      .addCase(fetchPlaceDetails.rejected, (state, action) => {
        const placeId = action.meta.arg;
        if (!placeId) return;
        // aborts shouldn’t poison anything
        delete state.inFlightDetails[placeId];
      });
  },
});

export default placeSearchSlice.reducer;

export const { clearPredictions, setInput, resetPlaceSearch } = placeSearchSlice.actions;

export const selectPlaceSearchInput = (state) => state.placeSearch.input;
export const selectPlacePredictions = (state) => state.placeSearch.predictions || [];
export const selectPlaceSearchStatus = (state) => state.placeSearch.status;
export const selectPlaceSearchError = (state) => state.placeSearch.error;

// Details selector (cached)
export const selectPlaceDetailsById = (placeId) => (state) =>
  state.placeSearch.detailsByPlaceId?.[placeId]?.details ?? null;

// Optional: expose whether a specific details request is in flight
export const selectIsFetchingPlaceDetails = (placeId) => (state) =>
  !!state.placeSearch.inFlightDetails?.[placeId];

// Optional: expose cache age if you want
export const makeSelectPredictionsCacheAge = ({ input, lat, lng }) =>
  createSelector(
    (state) => state.placeSearch.predictionsCache,
    (cache) => {
      const q = (input || "").trim();
      const key = buildQueryKey({ input: q, lat, lng });
      const entry = cache?.[key];
      return entry?.fetchedAt ? now() - entry.fetchedAt : null;
    }
  );
