import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getUserToken } from '../functions';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

export const fetchBusinessInsights = createAsyncThunk(
  'insights/fetch',
  async (params, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const query = new URLSearchParams(params).toString();
      const { data } = await axios.get(`${BASE_URL}/engagementInsights?${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return data;
    } catch (e) {
      return rejectWithValue(e.response?.data?.message || 'Failed to fetch insights');
    }
  }
);

const insightsSlice = createSlice({
  name: 'insights',
  initialState: { loading: false, error: null, data: null },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchBusinessInsights.pending, s => { s.loading = true; s.error = null; });
    builder.addCase(fetchBusinessInsights.fulfilled, (s,a) => { s.loading = false; s.data = a.payload; });
    builder.addCase(fetchBusinessInsights.rejected, (s,a) => { s.loading = false; s.error = a.payload; });
  }
});

export const selectInsights = s => s.insights.data;
export const selectInsightsLoading = s => s.insights.loading;
export const selectInsightsError = s => s.insights.error;

export default insightsSlice.reducer;
