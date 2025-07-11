import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserToken } from '../functions';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

// 🔄 POST engagement
export const logEngagement = createAsyncThunk(
  'engagement/logEngagement',
  async ({ targetType, targetId, engagementType, placeId }, { rejectWithValue }) => {
    try {
      const token = await getUserToken(); // or wherever you store the auth token
      const response = await axios.post(
        `${BASE_URL}/engagement`,
        { targetType, targetId, engagementType, placeId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to log engagement');
    }
  }
);

export const logEngagementIfNeeded = async (dispatch, { targetType, targetId, engagementType, placeId }) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // e.g., "2025-07-10"
    const storageKey = `engagement-${today}`;
    const uniqueKey = `${targetType}:${String(targetId)}:${engagementType}`;

    const stored = await AsyncStorage.getItem(storageKey);
    const parsed = stored ? JSON.parse(stored) : {};

    if (parsed[uniqueKey]) {
      console.log(`📦 Skipping persistent log: ${uniqueKey} already recorded in AsyncStorage`);
      return;
    }

    console.log(`🚀 Attempting to log engagement: ${uniqueKey} to backend...`);

    const resultAction = await dispatch(logEngagement({ targetType, targetId, engagementType, placeId }));

    if (logEngagement.fulfilled.match(resultAction)) {
      console.log(`✅ Engagement logged to backend: ${uniqueKey}`);
      parsed[uniqueKey] = true;
      await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
    } else {
      console.warn(`❌ Backend rejected engagement log for ${uniqueKey}:`, resultAction.payload);
    }
  } catch (error) {
    console.warn('⚠️ Failed to check or log engagement:', error);
  }
};

export const clearTodayEngagementLog = async () => {
  const today = new Date().toISOString().slice(0, 10); // e.g., "2025-07-10"
  const key = `engagement-${today}`;

  try {
    await AsyncStorage.removeItem(key);
    console.log(`🧹 Cleared engagement log for ${key}`);
  } catch (err) {
    console.warn(`⚠️ Failed to clear engagement log:`, err);
  }
};

export const getEngagementTarget = (input) => {
  const kind = input.kind?.toLowerCase() || input.postType?.toLowerCase() || '';
  let targetType = 'place';
  let targetId = input.placeId;

  if (kind.includes('event')) {
    targetType = 'event';
    targetId = input._id || input.postId;
  } else if (kind.includes('promo')) {
    targetType = 'promo';
    targetId = input._id || input.postId;
  }

  return { targetType, targetId };
};

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
