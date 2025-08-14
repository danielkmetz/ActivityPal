import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import axios from 'axios';

// Point this at your API
const API_BASE = `${process.env.EXPO_PUBLIC_API_BASE_URL}/liveStream`;

export const fetchLiveNow = createAsyncThunk(
  'live/fetchLiveNow',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await axios.get(`${API_BASE}/now`);
      return data || [];
    } catch (e) {
      return rejectWithValue(e.response?.data?.message || 'Failed to load live streams');
    }
  }
);

const liveStreamSlice = createSlice({
  name: 'live',
  initialState: {
    liveNow: [],
    status: 'idle',
    error: null,
  },
  reducers: {
    upsertLive(state, action) {
      const idx = state.liveNow.findIndex(x => x._id === action.payload._id);
      if (idx >= 0) state.liveNow[idx] = action.payload;
      else state.liveNow.unshift(action.payload);
    },
    removeLive(state, action) {
      state.liveNow = state.liveNow.filter(x => x._id !== action.payload);
    },
    clearLive(state) {
      state.liveNow = [];
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLiveNow.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchLiveNow.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.liveNow = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchLiveNow.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to load live streams';
      });
  }
});

export const { upsertLive, removeLive, clearLive } = liveStreamSlice.actions;
export default liveStreamSlice.reducer;

// SELECTORS
export const selectLiveNow = (state) => state.live.liveNow;
export const selectLiveStatus = (state) => state.live.status;
export const selectLiveError = (state) => state.live.error;

export const makeSelectLiveById = (id) =>
  createSelector([selectLiveNow], (list) => list.find(x => x._id === id));
