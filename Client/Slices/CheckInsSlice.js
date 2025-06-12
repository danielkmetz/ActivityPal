import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { addCheckInUserAndFriendsReviews, addCheckInProfileReviews, updatePostInReviewState } from './ReviewsSlice';

const API_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/checkIns`;

// Thunks for asynchronous operations

// Fetch all check-ins for a user
export const fetchUserCheckIns = createAsyncThunk(
  'checkIns/fetchUserCheckIns',
  async (userId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/user/${userId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// Create a new check-in
export const createCheckIn = createAsyncThunk(
  'checkIns/createCheckIn',
  async (checkInData, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.post(`${API_URL}/post`, checkInData);

      await dispatch(addCheckInUserAndFriendsReviews(response.data.data));
      await dispatch(addCheckInProfileReviews(response.data.data));

      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// Edit an existing check-in
export const editCheckIn = createAsyncThunk(
  'checkIns/editCheckIn',
  async ({ userId, checkInId, updatedData }, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.put(`${API_URL}/${userId}/${checkInId}`, updatedData);

      dispatch(updatePostInReviewState(response.data.checkIn));

      return response.data;
    } catch (error) {
      return rejectWithValue(error.response.data);
    }
  }
);

// Delete a check-in
export const deleteCheckIn = createAsyncThunk(
  "checkIns/deleteCheckIn",
  async ({ userId, checkInId }, { rejectWithValue }) => {
    try {
      const response = await axios.delete(`${API_URL}/${userId}/${checkInId}`);
      return { userId, checkInId };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

// Initial state
const initialState = {
  checkIns: [],
  loading: false,
  error: null,
};

// Slice
const checkInsSlice = createSlice({
  name: 'checkIns',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch user check-ins
      .addCase(fetchUserCheckIns.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUserCheckIns.fulfilled, (state, action) => {
        state.loading = false;
        state.checkIns = action.payload;
      })
      .addCase(fetchUserCheckIns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create check-in
      .addCase(createCheckIn.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createCheckIn.fulfilled, (state, action) => {
        state.loading = false;
        const newCheckIn = action.payload;

        state.checkIns.push(newCheckIn);
      })
      .addCase(createCheckIn.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Edit check-in
      .addCase(editCheckIn.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(editCheckIn.fulfilled, (state, action) => {
        state.loading = false;
        
        const index = state.checkIns.findIndex(
          (checkIn) => checkIn.id === action.payload.id
        );
        if (index !== -1) {
          state.checkIns[index] = action.payload;
        }
      })
      .addCase(editCheckIn.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Delete check-in
      .addCase(deleteCheckIn.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteCheckIn.fulfilled, (state, action) => {
        state.loading = false;
        state.checkIns = state.checkIns.filter(
          (checkIn) => checkIn.id !== action.payload
        );
      })
      .addCase(deleteCheckIn.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export default checkInsSlice.reducer;

export const selectCheckIns = (state) => state.checkIns.checkIns || [];
