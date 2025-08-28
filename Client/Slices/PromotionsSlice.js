import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { updateNearbySuggestionLikes } from "./GooglePlacesSlice";
import { updatePromotions } from '../utils/posts/UpdatePromotions';
import axios from "axios";

const API_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/promotions`; // Update this to match your backend URL

export const fetchPromotionById = createAsyncThunk(
  "promotions/fetchPromotionById",
  async ({ promotionId }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/promotion/${promotionId}`);
      return response.data.promotion; // assuming backend returns { promotion: {...} }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to fetch promotion";
      return rejectWithValue(errorMessage);
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

export const togglePromoLike = createAsyncThunk(
  "promotions/togglePromoLike",
  async ({ placeId, id, userId, fullName }, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.post(`${API_URL}/${id}/like`,
        {
          userId,
          fullName,
        }
      );

      const newLikes = response.data.likes;

      dispatch(updateNearbySuggestionLikes({
        postId: id,
        likes: newLikes,
      }))

      return {
        promoId: id,
        likes: newLikes,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to like promotion";

      return rejectWithValue(errorMessage);
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
        state.loading = false;
        state.promotions = action.payload;
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
      .addCase(togglePromoLike.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(togglePromoLike.fulfilled, (state, action) => {
        state.loading = false;
        const { promoId, likes } = action.payload;

        const index = state.promotions.findIndex((p) => p._id === promoId);
        if (index !== -1) {
          state.promotions[index].likes = likes;
        }
        if (state.selectedPromotion?._id === promoId) {
          state.selectedPromotion.likes = likes;
        }
      })
      .addCase(togglePromoLike.rejected, (state, action) => {
        state.loading = false;
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
