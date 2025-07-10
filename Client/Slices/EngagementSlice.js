import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getUserToken } from '../functions';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

// 🔄 POST engagement
export const logEngagement = createAsyncThunk(
  'engagement/logEngagement',
  async ({ targetType, targetId, engagementType }, { rejectWithValue }) => {
    try {
      const token = await getUserToken(); // or wherever you store the auth token
      const response = await axios.post(
        `${BASE_URL}/engagement`,
        { targetType, targetId, engagementType },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to log engagement');
    }
  }
);

// 📊 GET engagement data (optional - for insights or admin views)
export const fetchEngagements = createAsyncThunk(
  'engagement/fetchEngagements',
  async ({ targetType, targetId }, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const response = await axios.get(
        `${BASE_URL}/engagement?targetType=${targetType}&targetId=${targetId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch engagement data');
    }
  }
);

const engagementSlice = createSlice({
  name: 'engagement',
  initialState: {
    loading: false,
    error: null,
    successMessage: null,
    data: null
  },
  reducers: {
    clearEngagementState: (state) => {
      state.loading = false;
      state.error = null;
      state.successMessage = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(logEngagement.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.successMessage = null;
      })
      .addCase(logEngagement.fulfilled, (state, action) => {
        state.loading = false;
        state.successMessage = action.payload.message;
      })
      .addCase(logEngagement.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(fetchEngagements.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEngagements.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchEngagements.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { clearEngagementState } = engagementSlice.actions;

export const selectEngagementLoading = (state) => state.engagement.loading;
export const selectEngagementError = (state) => state.engagement.error;
export const selectEngagementSuccess = (state) => state.engagement.successMessage;
export const selectEngagementData = (state) => state.engagement.data;

export default engagementSlice.reducer;
