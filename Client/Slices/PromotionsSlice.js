import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { updatePromotions } from '../utils/posts/UpdatePromotions';
import axios from "axios";

const API_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/promotions`; // Update this to match your backend URL

export const fetchPromotionById = createAsyncThunk(
  'promotions/fetchPromotionById',
  async ({ promotionId }, { rejectWithValue }) => {
    try {
      const res = await axios.get(`${BASE_URL}/promotion/${promotionId}`);
      // success shape stays the same: promotion object
      return res.data.promotion;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        // 🔇 suppress logs for 404
        return rejectWithValue({ status: 404, message: 'Not Found' });
      }
      if (__DEV__) console.error('[fetchPromotionById]', err);
      return rejectWithValue({
        status: status ?? 0,
        message: err?.response?.data?.message || err?.message || 'Failed to fetch promotion',
      });
    }
  }
);

// 1️⃣ Fetch Promotions by placeId
export const fetchPromotions = createAsyncThunk(
  "promotions/fetchPromotions",
  async (placeId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${API_URL}/${placeId}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || "Failed to fetch promotions");
    }
  }
);

// 2️⃣ Create a Promotion
export const createPromotion = createAsyncThunk(
  "promotions/createPromotion",
  async (promotionData, { rejectWithValue }) => {
    try {
      const response = await axios.post(API_URL, promotionData);
      return response.data.promotion; // Returning the created promotion
    } catch (error) {
      return rejectWithValue(error.response?.data || "Failed to create promotion");
    }
  }
);

// 3️⃣ Update a Promotion
export const updatePromotion = createAsyncThunk(
  "promotions/updatePromotion",
  async ({ promotionId, updatedData }, { rejectWithValue }) => {
    try {
      const response = await axios.put(`${API_URL}/${promotionId}`, updatedData);
      return response.data.promotion;
    } catch (error) {
      return rejectWithValue(error.response?.data || "Failed to update promotion");
    }
  }
);

// 4️⃣ Delete a Promotion
export const deletePromotion = createAsyncThunk(
  "promotions/deletePromotion",
  async ({ promotionId, placeId }, { rejectWithValue }) => {
    try {
      await axios.delete(`${API_URL}/${promotionId}`, { data: { placeId } });
      return promotionId; // Return the deleted promotion ID for filtering
    } catch (error) {
      return rejectWithValue(error.response?.data || "Failed to delete promotion");
    }
  }
);

// 📌 Slice Definition
const promotionsSlice = createSlice({
  name: "promotions",
  initialState: {
    promotions: [],
    selectedPromotion: null,
    loading: false,
    error: null,
  },
  reducers: {
    resetSelectedPromotion: (state) => {
      state.selectedPromotion = null;
    },
    applyPromotionUpdates: (state, action) => {
      const { postId, updates, debug, label } = action.payload || {};
      console.log('thunk updates', updates)
      if (!postId || !updates) return;
      updatePromotions({ state, postId, updates, debug, label });
    },
  },
  extraReducers: (builder) => {
    builder
      // 📌 Fetch Promotions
      .addCase(fetchPromotions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPromotions.fulfilled, (state, action) => {
        const { promotions } = action.payload;

        state.loading = false;
        state.promotions = promotions;
      })
      .addCase(fetchPromotions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // 📌 Create Promotion
      .addCase(createPromotion.fulfilled, (state, action) => {
        state.promotions.push(action.payload);
      })
      .addCase(createPromotion.rejected, (state, action) => {
        state.error = action.payload;
      })
      // 📌 Update Promotion
      .addCase(updatePromotion.fulfilled, (state, action) => {
        const index = state.promotions.findIndex(promo => promo._id === action.payload._id);
        if (index !== -1) {
          state.promotions[index] = action.payload;
        }
      })
      .addCase(updatePromotion.rejected, (state, action) => {
        state.error = action.payload;
      })
      // 📌 Delete Promotion
      .addCase(deletePromotion.fulfilled, (state, action) => {
        state.promotions = state.promotions.filter(promo => promo._id !== action.payload);
      })
      .addCase(deletePromotion.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(fetchPromotionById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPromotionById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedPromotion = action.payload;
      })
      .addCase(fetchPromotionById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
  },
});

export const { resetSelectedPromotion, applyPromotionUpdates } = promotionsSlice.actions;

// 📌 Selectors
export const selectPromotions = (state) => state.promotions.promotions;
export const selectLoading = (state) => state.promotions.loading;
export const selectError = (state) => state.promotions.error;
export const selectSelectedPromotion = (state) => state.promotions.selectedPromotion;
export const selectPromotionById = (state, promotionId) =>
  state.promotions.promotions.find((promo) => promo._id === promotionId);


export default promotionsSlice.reducer;
