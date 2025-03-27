import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

// Thunk to fetch AI-curated places
export const fetchGooglePlaces = createAsyncThunk(
  'GooglePlaces/fetchGooglePlaces',
  async ({ lat, lng, activityType, radius, budget }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/google/places`, {
        lat,
        lng,
        activityType,
        radius,
        budget,
      });
      return response.data.curatedPlaces;
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

const GooglePlacesSlice = createSlice({
  name: 'GooglePlaces',
  initialState: {
    curatedPlaces: [],
    status: 'idle',
    error: null,
  },
  reducers: {
    clearGooglePlaces: (state) => {
      state.curatedPlaces = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchGooglePlaces.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchGooglePlaces.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.curatedPlaces = action.payload;
      })
      .addCase(fetchGooglePlaces.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch curated places';
      });
  },
});

export const { clearGooglePlaces } = GooglePlacesSlice.actions;

export const selectGooglePlaces = (state) => state.GooglePlaces.curatedPlaces;
export const selectGoogleStatus = (state) => state.GooglePlaces.status;

export default GooglePlacesSlice.reducer;
