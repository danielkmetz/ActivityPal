import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { 
  updateNearbySuggestionCommentOrReply,
  addNearbySuggestionComment,
  addNearbySuggestionReply,
  removeNearbySuggestionCommentOrReply,
  updateNearbySuggestionLikes,
} from "./GooglePlacesSlice";
import { createNotification } from "./NotificationsSlice";
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

export const leavePromoComment = createAsyncThunk(
  "promotions/leavePromoComment",
  async ({ placeId, id, userId, fullName, commentText, media }, { rejectWithValue, dispatch }) => {
    try {
      console.log("📤 Sending comment request:", {
        placeId,
        promoId: id,
        userId,
        fullName,
        commentText,
        media,
      });

      const response = await axios.post(
        `${API_URL}/${id}/comment`, // Ensure the second `${id}` is actually the promoId
        {
          userId,
          fullName,
          commentText,
          media,
        }
      );

      console.log("✅ Server response:", response.data);

      const newComment = response.data.comment;

      if (!newComment) {
        throw new Error("No comment returned from server.");
      }

      dispatch(addNearbySuggestionComment({
        postId: id,
        newComment,
      }));

      console.log("📥 Dispatched addNearbySuggestionComment:", { postId: id, newComment });

      return {
        promoId: id,
        newComment,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to leave comment";
      console.error("❌ Error leaving promo comment:", errorMessage);
      return rejectWithValue(errorMessage);
    }
  }
);

export const leavePromoReply = createAsyncThunk(
  "promotions/leavePromoReply",
  async (
    { placeId, id, commentId, userId, fullName, commentText, media },
    { rejectWithValue, dispatch }
  ) => {
    try {
      const response = await axios.post(
        `${API_URL}/${id}/comments/${commentId}/replies`,
        {
          userId,
          fullName,
          commentText,
          media,
        }
      );

      const newReply = response.data.reply;

      dispatch(addNearbySuggestionReply({
        postId: id,
        commentId,
        newReply,
      }));

      return {
        promoId: id,
        commentId,
        newReply,
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
    { placeId, id, commentId, userId, fullName },
    { rejectWithValue, dispatch }
  ) => {
    try {
      const response = await axios.put(
        `${API_URL}/${id}/comments/${commentId}/like`,
        {
          userId,
          fullName,
        }
      );

      const updatedLikes = response.data.likes;

      dispatch(updateNearbySuggestionCommentOrReply({
        postId: id,
        commentId,
        updatedComment: { _id: commentId, likes: updatedLikes },
      }));

      return {
        promoId: id,
        updatedLikes,
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
  async ({ id, commentId, commentText, media }, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.patch(
        `${API_URL}/${id}/edit-comment/${commentId}`,
        { newText: commentText, media }
      );

      const updatedComment = response.data.updatedComment;

      dispatch(updateNearbySuggestionCommentOrReply({
        postId: id,
        commentId,
        updatedComment,
      }));

      return {
        promoId: id,
        updatedComment,
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
  async ({ id, commentId }, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.delete(
        `${API_URL}/${id}/delete-comment/${commentId}`
      );

      dispatch(removeNearbySuggestionCommentOrReply({
        postId: id,
        commentId,
      }));

      return {
        promoId: id,
        commentId,
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
        const { promoId, updatedLikes } = action.payload;

        const index = state.promotions.findIndex((p) => p._id === promoId);
        if (index !== -1) {
          state.promotions[index].likes = updatedLikes;
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
        const { promoId, newComment } = action.payload;

        const promo = state.promotions.find(p => p._id === promoId);
        if (promo) {
          promo.comments = promo.comments || [];
          promo.comments.push(newComment);
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
        const { promoId, commentId, newReply } = action.payload;

        const findAndInsertReply = (comments) => {
          for (let comment of comments) {
            if (comment._id === commentId) {
              comment.replies = comment.replies || [];
              comment.replies.push(newReply);
              return true;
            }
            if (comment.replies && findAndInsertReply(comment.replies)) {
              return true;
            }
          }
          return false;
        };

        const event = state.promotions.find((e) => e._id === promoId);
        if (event && Array.isArray(event.comments)) {
          findAndInsertReply(event.comments);
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
