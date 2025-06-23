import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

const API_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/promotions`; // Update this to match your backend URL

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
  async ({ placeId, promoId, userId, fullName }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/business/promotions/${placeId}/${promoId}/like`,
        {
          userId,
          fullName,
        }
      );

      return {
        promoId,
        updatedPromotion: response.data.promotion,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to like promotion";
      return rejectWithValue(errorMessage);
    }
  }
);

export const leavePromoComment = createAsyncThunk(
  "promotions/leavePromoComment",
  async ({ placeId, promoId, userId, fullName, commentText }, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/business/promotions/${placeId}/${promoId}/comment`,
        {
          userId,
          fullName,
          commentText,
        }
      );

      return {
        promoId,
        updatedPromotion: response.data.promotion,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to leave comment";
      return rejectWithValue(errorMessage);
    }
  }
);

export const leavePromoReply = createAsyncThunk(
  "promotions/leavePromoReply",
  async (
    { placeId, promoId, commentId, userId, fullName, commentText },
    { rejectWithValue }
  ) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/business/promotions/${placeId}/${promoId}/reply/${commentId}`,
        {
          userId,
          fullName,
          commentText,
        }
      );

      return {
        promoId,
        updatedPromotion: response.data.promotion,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to leave reply";
      return rejectWithValue(errorMessage);
    }
  }
);

export const likePromoCommentOrReply = createAsyncThunk(
  "promotions/likePromoCommentOrReply",
  async (
    { placeId, promoId, commentId, userId, fullName },
    { rejectWithValue }
  ) => {
    try {
      const response = await axios.put(
        `${BASE_URL}/business/promotions/${placeId}/${promoId}/like-comment/${commentId}`,
        {
          userId,
          fullName,
        }
      );

      return {
        promoId,
        updatedPromotion: response.data.promotion,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to like comment/reply";
      return rejectWithValue(errorMessage);
    }
  }
);

export const editPromoCommentOrReply = createAsyncThunk(
  "promotions/editPromoCommentOrReply",
  async ({ promotionId, commentId, commentText }, { rejectWithValue }) => {
    try {
      const response = await axios.put(
        `${BASE_URL}/business/promotions/${promotionId}/edit-comment/${commentId}`,
        { commentText }
      );

      return {
        promotionId,
        updatedPromotion: response.data.promotion,
      };
    } catch (error) {
      const message =
        error.response?.data?.message || error.message || "Failed to edit comment";
      return rejectWithValue(message);
    }
  }
);

export const deletePromoCommentOrReply = createAsyncThunk(
  "promotions/deletePromoCommentOrReply",
  async ({ promotionId, commentId }, { rejectWithValue }) => {
    try {
      const response = await axios.delete(
        `${BASE_URL}/business/promotions/${promotionId}/delete-comment/${commentId}`
      );

      return {
        promotionId,
        updatedPromotion: response.data.promotion,
      };
    } catch (error) {
      const message =
        error.response?.data?.message || error.message || "Failed to delete comment";
      return rejectWithValue(message);
    }
  }
);

// 📌 Slice Definition
const promotionsSlice = createSlice({
  name: "promotions",
  initialState: {
    promotions: [],
    loading: false,
    error: null,
  },
  reducers: {},
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
        const { promoId, updatedPromotion } = action.payload;

        const index = state.promotions.findIndex((p) => p._id === promoId);
        if (index !== -1) {
          state.promotions[index] = updatedPromotion;
        }
      })
      .addCase(togglePromoLike.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(leavePromoComment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(leavePromoComment.fulfilled, (state, action) => {
        state.loading = false;
        const { promoId, updatedPromotion } = action.payload;

        const index = state.promotions.findIndex((p) => p._id === promoId);
        if (index !== -1) {
          state.promotions[index] = updatedPromotion;
        }
      })
      .addCase(leavePromoComment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(leavePromoReply.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(leavePromoReply.fulfilled, (state, action) => {
        state.loading = false;
        const { promoId, updatedPromotion } = action.payload;

        const index = state.promotions.findIndex((p) => p._id === promoId);
        if (index !== -1) {
          state.promotions[index] = updatedPromotion;
        }
      })
      .addCase(leavePromoReply.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(likePromoCommentOrReply.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(likePromoCommentOrReply.fulfilled, (state, action) => {
        state.loading = false;
        const { promoId, updatedPromotion } = action.payload;

        const index = state.promotions.findIndex((p) => p._id === promoId);
        if (index !== -1) {
          state.promotions[index] = updatedPromotion;
        }
      })
      .addCase(likePromoCommentOrReply.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(editPromoCommentOrReply.fulfilled, (state, action) => {
        const { promotionId, updatedPromotion } = action.payload;
        state.promotions = state.promotions.map((promo) =>
          promo._id === promotionId ? updatedPromotion : promo
        );
      })
      .addCase(editPromoCommentOrReply.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(deletePromoCommentOrReply.fulfilled, (state, action) => {
        const { promotionId, updatedPromotion } = action.payload;
        state.promotions = state.promotions.map((promo) =>
          promo._id === promotionId ? updatedPromotion : promo
        );
      })
      .addCase(deletePromoCommentOrReply.rejected, (state, action) => {
        state.error = action.payload;
      })
  },
});

// 📌 Selectors
export const selectPromotions = (state) => state.promotions.promotions;
export const selectLoading = (state) => state.promotions.loading;
export const selectError = (state) => state.promotions.error;

export default promotionsSlice.reducer;
