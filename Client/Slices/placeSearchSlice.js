import { createSlice, createAsyncThunk, createSelector } from "@reduxjs/toolkit";
import { mergePlaceThumbnails } from "./PlacePhotosSlice";
import api from "../api";

const PREDICTIONS_TTL_MS = 1000 * 30;          // 30s
const DETAILS_TTL_MS = 1000 * 60 * 60 * 24;    // 24h
const DEFAULT_MODE = "establishment"; // or "address"
const normalizeMode = (m) => (m === "address" ? "address" : "establishment");

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

const now = () => Date.now();

const buildQueryKey = ({ input, lat, lng, mode, country }) => {
  const q = (input || "").trim().toLowerCase();
  const la = roundCoord(lat, 3);
  const ln = roundCoord(lng, 3);
  const md = normalizeMode(mode);
  const c = (country || "us").trim().toLowerCase();
  return `${md}::${c}::${q}::${la ?? "na"}::${ln ?? "na"}`;
};

const buildDetailsKey = ({ placeId, mode }) => {
  const md = normalizeMode(mode);
  return `${String(placeId)}::${md}`;
};

/**
 * Predictions
 * - cache (TTL)
 * - dedupe in-flight
 * - abort-safe
 * - ignore stale responses
 */
export const fetchPlacePredictions = createAsyncThunk(
  "placeSearch/fetchPredictions",
  async (
    { input, lat, lng, mode = DEFAULT_MODE, country = "us", sessionToken },
    { getState, dispatch, signal, rejectWithValue }
  ) => {
    try {
      const q = (input || "").trim();
      const md = normalizeMode(mode);

      const queryKey = buildQueryKey({ input: q, lat, lng, mode: md, country });

      if (q.length < 3) {
        return { queryKey, predictions: [], mode: md };
      }

      const cached = getState()?.placeSearch?.predictionsCache?.[queryKey];
      if (cached && now() - cached.fetchedAt < PREDICTIONS_TTL_MS) {
        return { queryKey, predictions: cached.predictions || [], mode: md, fromCache: true };
      }

      const res = await api.get(`/api/places/autocomplete`, {
        params: {
          input: q,
          lat,
          lng,
          mode: md,              // ✅ NEW
          country,               // ✅ optional
          sessionToken,          // ✅ optional but recommended
        },
        signal,
      });

      const predictions = Array.isArray(res.data?.predictions) ? res.data.predictions : [];

      // ✅ only merge thumbnails for establishments
      if (md === "establishment") {
        const thumbnails =
          res.data?.thumbnails && typeof res.data.thumbnails === "object"
            ? res.data.thumbnails
            : null;

        if (thumbnails) {
          dispatch(mergePlaceThumbnails({ results: thumbnails, fetchedAt: now() }));
        }
      }

      return { queryKey, predictions, mode: md, fromCache: false };
    } catch (err) {
      if (signal?.aborted) return rejectWithValue({ aborted: true });
      return rejectWithValue({ message: extractErr(err, "Failed to fetch predictions") });
    }
  },
  {
    condition: ({ input, lat, lng, mode = DEFAULT_MODE, country = "us" }, { getState }) => {
      const q = (input || "").trim();
      if (q.length < 3) return false;

      const queryKey = buildQueryKey({ input: q, lat, lng, mode, country });
      const state = getState()?.placeSearch;

      if (state?.inFlightPredictions?.[queryKey]) return false;
      return true;
    },
  }
);

/**
 * Details
 * - cache (TTL)
 * - dedupe in-flight
 * - abort-safe
 */
export const fetchPlaceDetails = createAsyncThunk(
  "placeSearch/fetchDetails",
  async (
    { placeId, mode = DEFAULT_MODE, sessionToken },
    { getState, signal, rejectWithValue }
  ) => {
    try {
      if (!placeId) return rejectWithValue({ message: "Missing placeId" });

      const md = normalizeMode(mode);
      const detailsKey = buildDetailsKey({ placeId, mode: md });

      const existing = getState()?.placeSearch?.detailsByKey?.[detailsKey];
      if (existing && now() - existing.fetchedAt < DETAILS_TTL_MS) {
        return {
          detailsKey,
          placeId,
          mode: md,
          details: existing.details ?? null,
          fetchedAt: existing.fetchedAt,
          fromCache: true,
        };
      }

      const res = await api.get(`/api/places/details`, {
        params: {
          placeId,
          mode: md,           // ✅ NEW
          sessionToken,       // ✅ optional
        },
        signal,
      });

      const details = res.data?.result ?? null;

      return {
        detailsKey,
        placeId,
        mode: md,
        details,
        fetchedAt: now(),
        fromCache: false,
      };
    } catch (err) {
      if (signal?.aborted) return rejectWithValue({ aborted: true });
      return rejectWithValue({ message: extractErr(err, "Failed to fetch details") });
    }
  },
  {
    condition: ({ placeId, mode = DEFAULT_MODE }, { getState }) => {
      if (!placeId) return false;

      const md = normalizeMode(mode);
      const detailsKey = buildDetailsKey({ placeId, mode: md });
      const state = getState()?.placeSearch;

      if (state?.inFlightDetails?.[detailsKey]) return false;
      return true;
    },
  }
);

const placeSearchSlice = createSlice({
  name: "placeSearch",
  initialState: {
    input: "",
    predictions: [],
    status: "idle",
    error: null,
    activePredictionsQueryKey: null,
    activePredictionsRequestId: null,
    predictionsCache: {
      // [queryKey]: { predictions: [], fetchedAt }
    },
    detailsByKey: {
      // [`${placeId}::${mode}`]: { details: object|null, fetchedAt }
    },
    inFlightPredictions: {
      // [queryKey]: true
    },
    inFlightDetails: {
      // [detailsKey]: true
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
    resetPlaceSearch: (state) => {
      state.input = "";
      state.predictions = [];
      state.status = "idle";
      state.error = null;
      state.activePredictionsQueryKey = null;
      state.activePredictionsRequestId = null;
      state.predictionsCache = {};
      state.detailsByKey = {};
      state.inFlightPredictions = {};
      state.inFlightDetails = {};
    },
  },
  extraReducers: (builder) => {
    builder
      // -------------------- Predictions --------------------
      .addCase(fetchPlacePredictions.pending, (state, action) => {
        const { input, lat, lng, mode = DEFAULT_MODE, country = "us" } = action.meta.arg || {};
        const q = (input || "").trim();

        const queryKey = buildQueryKey({ input: q, lat, lng, mode, country });

        state.status = "loading";
        state.error = null;

        state.activePredictionsQueryKey = queryKey;
        state.activePredictionsRequestId = action.meta.requestId;

        state.inFlightPredictions[queryKey] = true;
      })
      .addCase(fetchPlacePredictions.fulfilled, (state, action) => {
        const reqId = action.meta.requestId;
        const { queryKey, predictions } = action.payload || {};

        // ignore stale responses
        if (state.activePredictionsRequestId !== reqId) {
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

        if (state.activePredictionsRequestId && state.activePredictionsRequestId !== reqId) return;

        const payload = action.payload;
        if (payload?.aborted) {
          state.status = "idle";
          state.error = null;
        } else {
          state.status = "failed";
          state.error = payload?.message || action.error?.message || "Failed";
        }

        const { input, lat, lng, mode = DEFAULT_MODE, country = "us" } = action.meta.arg || {};
        const q = (input || "").trim();
        const queryKey = buildQueryKey({ input: q, lat, lng, mode, country });
        delete state.inFlightPredictions[queryKey];
      })

      // -------------------- Details --------------------
      .addCase(fetchPlaceDetails.pending, (state, action) => {
        const { placeId, mode = DEFAULT_MODE } = action.meta.arg || {};
        if (!placeId) return;

        const detailsKey = buildDetailsKey({ placeId, mode });
        state.inFlightDetails[detailsKey] = true;
      })
      .addCase(fetchPlaceDetails.fulfilled, (state, action) => {
        const { detailsKey, details, fetchedAt } = action.payload || {};
        if (!detailsKey) return;

        state.detailsByKey[detailsKey] = {
          details: details ?? null,
          fetchedAt: fetchedAt ?? now(),
        };
        delete state.inFlightDetails[detailsKey];
      })
      .addCase(fetchPlaceDetails.rejected, (state, action) => {
        const { placeId, mode = DEFAULT_MODE } = action.meta.arg || {};
        if (!placeId) return;

        const detailsKey = buildDetailsKey({ placeId, mode });
        delete state.inFlightDetails[detailsKey];
      });
  },
});

export default placeSearchSlice.reducer;

export const { clearPredictions, setInput, resetPlaceSearch } = placeSearchSlice.actions;

export const selectPlaceSearchInput = (state) => state.placeSearch.input;
export const selectPlacePredictions = (state) => state.placeSearch.predictions || [];
export const selectPlaceSearchStatus = (state) => state.placeSearch.status;
export const selectPlaceSearchError = (state) => state.placeSearch.error;

// Details selector (cached) – now mode-aware
export const selectPlaceDetailsById = (placeId, mode = DEFAULT_MODE) => (state) => {
  const detailsKey = buildDetailsKey({ placeId, mode });
  return state.placeSearch.detailsByKey?.[detailsKey]?.details ?? null;
};

export const selectIsFetchingPlaceDetails = (placeId, mode = DEFAULT_MODE) => (state) => {
  const detailsKey = buildDetailsKey({ placeId, mode });
  return !!state.placeSearch.inFlightDetails?.[detailsKey];
};

export const makeSelectPredictionsCacheAge = ({ input, lat, lng, mode = DEFAULT_MODE, country = "us" }) =>
  createSelector(
    (state) => state.placeSearch.predictionsCache,
    (cache) => {
      const q = (input || "").trim();
      const key = buildQueryKey({ input: q, lat, lng, mode, country });
      const entry = cache?.[key];
      return entry?.fetchedAt ? now() - entry.fetchedAt : null;
    }
  );
