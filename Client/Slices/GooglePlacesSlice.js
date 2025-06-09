import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

export const fetchGooglePlaces = createAsyncThunk(
  'GooglePlaces/fetchGooglePlaces',
  async ({ lat, lng, activityType, quickFilter, radius, budget }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/places2/places-nearby`, {
        lat,
        lng,
        activityType,
        quickFilter,
        radius,
        budget,
      });
      return response.data.curatedPlaces;
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

// Thunk to fetch AI-curated places
export const fetchDining = createAsyncThunk(
  'GooglePlaces/fetchDining',
  async ({ lat, lng, activityType, radius, budget, isCustom }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/google/places`, {
        lat,
        lng,
        activityType,
        radius,
        budget,
        isCustom,
      });
      return response.data.curatedPlaces;
    } catch (err) {
      return rejectWithValue(err.response?.data || err.message);
    }
  }
);

export const fetchNearbyPromosAndEvents = createAsyncThunk(
  'GooglePlaces/fetchNearbyPromosAndEvents',
  async ({ lat, lng }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${BASE_URL}/places2/events-and-promos-nearby`, { lat, lng });
      
      return response.data.suggestions;
    } catch (error) {
      console.error('Error fetching promos/events:', error);
      return rejectWithValue(error.response?.data || 'Unknown error');
    }
  }
);

const GooglePlacesSlice = createSlice({
  name: 'GooglePlaces',
  initialState: {
    curatedPlaces: [],
    nearbySuggestions: [],
    status: 'idle',
    error: null,
  },
  reducers: {
    clearGooglePlaces: (state) => {
      state.curatedPlaces = [];
      state.error = null;
    },
    clearNearbySuggestions: (state) => {
      state.nearbySuggestions = [];
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
      })
      .addCase(fetchDining.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch curated places';
      })
      .addCase(fetchDining.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchDining.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.curatedPlaces = action.payload;
      })
      .addCase(fetchNearbyPromosAndEvents.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch curated places';
      })
      .addCase(fetchNearbyPromosAndEvents.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchNearbyPromosAndEvents.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.nearbySuggestions = action.payload;
      })
  },
});

export const { clearGooglePlaces, clearNearbySuggestions } = GooglePlacesSlice.actions;

export const selectGooglePlaces = (state) => state.GooglePlaces.curatedPlaces || [];
export const selectGoogleStatus = (state) => state.GooglePlaces.status;
export const selectNearbySuggestions = state => state.GooglePlaces.nearbySuggestions || [];

export default GooglePlacesSlice.reducer;
