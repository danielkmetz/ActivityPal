import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

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
  async (placeId, { getState, rejectWithValue }) => {
    try {
      if (!placeId) return rejectWithValue("Missing placeId");

      const existing = getState()?.placePhotos?.byPlaceId?.[placeId];
      if (existing) return { placeId, url: existing };

      const res = await api.get(`${BASE_URL}/place-photos/thumbnail`, { params: { placeId } });
      const url = res?.data?.url || null;

      return { placeId, url };
    } catch (err) {
      return rejectWithValue(extractErr(err, "Failed to fetch place thumbnail"));
    }
  }
);

const placePhotosSlice = createSlice({
  name: "placePhotos",
  initialState: {
    byPlaceId: {}, // { [placeId]: url }
    status: "idle",
    error: null,
  },
  reducers: {
    resetPlacePhotos: (state) => {
      state.byPlaceId = {};
      state.status = "idle";
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlaceThumbnail.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchPlaceThumbnail.fulfilled, (state, action) => {
        state.status = "succeeded";
        const { placeId, url } = action.payload || {};
        if (placeId && url) state.byPlaceId[placeId] = url;
      })
      .addCase(fetchPlaceThumbnail.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload || action.error.message;
      });
  },
});

export default placePhotosSlice.reducer;
export const { resetPlacePhotos } = placePhotosSlice.actions;
export const selectPlaceThumbnailsById = (state) => state.placePhotos.byPlaceId || {};
