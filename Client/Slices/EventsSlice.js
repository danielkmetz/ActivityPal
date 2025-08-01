import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import {
  updateNearbySuggestionCommentOrReply,
  addNearbySuggestionComment,
  addNearbySuggestionReply,
  removeNearbySuggestionCommentOrReply,
  updateNearbySuggestionLikes,
} from "./GooglePlacesSlice";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;

export const fetchEventById = createAsyncThunk(
  "events/fetchEventById",
  async ({ eventId }, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/business/event/${eventId}`);
      return response.data.event; // assuming the backend returns { event: {...} }
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to fetch event";
      return rejectWithValue(errorMessage);
    }
  }
);

// Thunk for fetching events
export const fetchEvents = createAsyncThunk(
  "events/fetchEvents",
  async (placeId, { rejectWithValue }) => {
    try {
      const response = await axios.get(`${BASE_URL}/business/events/${placeId}`);
      return response.data.events; // Return the events array on success
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to fetch events";
      return rejectWithValue(errorMessage); // Return the error message
    }
  }
);

// Thunk for creating an event
export const createEvent = createAsyncThunk(
  "events/createEvent",
  async (
    {
      placeId,
      title,
      date,
      description,
      photos,
      recurring,
      recurringDays,
      startTime = null,
      endTime = null,
      allDay,
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await axios.post(`${BASE_URL}/business/events/${placeId}`, {
        title,
        date,
        description,
        photos,
        recurring,
        recurringDays,
        startTime,
        endTime,
        allDay,
      });

      return response.data.event;
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to create event";

      return rejectWithValue(errorMessage);
    }
  }
);

// Thunk to edit an event
export const editEvent = createAsyncThunk(
  "events/editEvent",
  async ({ placeId, eventId, title, date, description, photos, recurring, recurringDays, startTime, endTime, allDay }, { rejectWithValue }) => {
    try {
      const response = await axios.put(
        `${BASE_URL}/business/events/${placeId}/${eventId}`,
        {
          title,
          date,
          description,
          photos,
          recurring,
          recurringDays,
          startTime,
          endTime,
          allDay,
        }
      );

      return response.data.event; // Return the updated event data on success
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to edit event";
      return rejectWithValue(errorMessage); // Handle errors
    }
  }
);

// Thunk for deleting an event
export const deleteEvent = createAsyncThunk(
  "events/deleteEvent",
  async ({ placeId, eventId }, { rejectWithValue }) => {
    try {
      const response = await axios.delete(`${BASE_URL}/business/events/${placeId}/${eventId}`);
      return response.data.eventId; // Return the updated events list
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to delete event";
      return rejectWithValue(errorMessage);
    }
  }
);

export const toggleEventLike = createAsyncThunk(
  "events/toggleEventLike",
  async ({ placeId, id, userId, fullName }, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/business/events/${placeId}/${id}/like`,
        { userId, fullName }
      );

      const { likes } = response.data;

      dispatch(updateNearbySuggestionLikes({
        postId: id,
        likes,
      }));

      return {
        eventId: id,
        likes: response.data.likes, // Updated likes array from the backend
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to toggle like";
      return rejectWithValue(errorMessage);
    }
  }
);

export const leaveEventComment = createAsyncThunk(
  "events/leaveEventComment",
  async ({ placeId, id, userId, fullName, commentText, media }, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/business/events/${placeId}/${id}/comments`,
        { userId, fullName, commentText, media }
      );

      dispatch(addNearbySuggestionComment({
        postId: id,
        newComment: response.data.comment,
      }));

      return {
        eventId: id,
        newComment: response.data.comment, // New comment object from backend
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to leave comment";
      return rejectWithValue(errorMessage);
    }
  }
);

export const leaveEventReply = createAsyncThunk(
  "events/leaveEventReply",
  async (
    { placeId, id, commentId, userId, fullName, commentText, media },
    { rejectWithValue, dispatch }
  ) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/business/events/${id}/comments/${commentId}/replies`,
        {
          commentId,
          userId,
          fullName,
          commentText,
          placeId,
          media,
        }
      );

      dispatch(addNearbySuggestionReply({
        postId: id,
        commentId,
        newReply: response.data.reply,
      }));

      return {
        eventId: id,
        commentId,
        newReply: response.data.reply,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to leave reply";
      return rejectWithValue(errorMessage);
    }
  }
);

export const toggleEventCommentLike = createAsyncThunk(
  "events/toggleEventCommentLike",
  async (
    { placeId, id, commentId, userId, fullName },
    { rejectWithValue, dispatch }
  ) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/business/events/${id}/comments/${commentId}/like`,
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
        eventId: id,
        commentId,
        updatedLikes,
      };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Failed to like comment";
      return rejectWithValue(errorMessage);
    }
  }
);

export const editEventCommentOrReply = createAsyncThunk(
  "events/editEventCommentOrReply",
  async ({ id, commentId, commentText, media }, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.put(
        `${BASE_URL}/business/events/${id}/edit-comment/${commentId}`,
        { commentText, media }
      );

      const updatedComment = response.data.updatedComment;

      dispatch(updateNearbySuggestionCommentOrReply({
        postId: id,
        commentId,
        updatedComment,
      }));

      return {
        eventId: id,
        updatedComment,
      };
    } catch (error) {
      const message =
        error.response?.data?.message || error.message || "Failed to edit comment";
      return rejectWithValue(message);
    }
  }
);

export const deleteEventCommentOrReply = createAsyncThunk(
  "events/deleteEventCommentOrReply",
  async ({ id, commentId }, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.delete(
        `${BASE_URL}/business/events/${id}/delete-comment/${commentId}`
      );

      dispatch(removeNearbySuggestionCommentOrReply({
        postId: id,
        commentId,
      }));

      return {
        postId: id,
        commentId,
      };
    } catch (error) {
      const message =
        error.response?.data?.message || error.message || "Failed to delete comment";
      return rejectWithValue(message);
    }
  }
);

const eventsSlice = createSlice({
  name: 'events',
  initialState: {
    events: [],
    selectedEvent: null,
    error: null,
    loading: false,
  },
  reducers: {
    resetEvents: (state) => {
      state.events = [];
    },
    resetSelectedEvent: (state) => {
      state.selectedEvent = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.loading = false;
        state.events = action.payload; // Set the fetched events
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload; // Set the error message
      })
      // Create Event
      .addCase(createEvent.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createEvent.fulfilled, (state, action) => {
        state.loading = false;
        state.events.push(action.payload); // Add the new event to the events array
      })
      .addCase(createEvent.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(editEvent.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(editEvent.fulfilled, (state, action) => {
        state.loading = false;
        const updatedEvent = action.payload;

        // Update the specific event in the state
        state.events = state.events.map((event) =>
          event._id === updatedEvent._id ? updatedEvent : event
        );
      })
      .addCase(editEvent.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload; // Set the error message
      })
      .addCase(deleteEvent.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteEvent.fulfilled, (state, action) => {
        state.loading = false;
        const deletedId = action.payload;
        state.events = state.events.filter(event => event._id !== deletedId);
      })
      .addCase(deleteEvent.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(toggleEventLike.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(toggleEventLike.fulfilled, (state, action) => {
        state.loading = false;
        const { eventId, likes } = action.payload;

        const event = state.events.find(e => e._id === eventId);
        if (event) {
          event.likes = likes;
        }
        if (state.selectedEvent?._id === eventId) {
          state.selectedEvent.likes = likes;
        }
      })
      .addCase(toggleEventLike.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(leaveEventComment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(leaveEventComment.fulfilled, (state, action) => {
        state.loading = false;
        const { eventId, newComment } = action.payload;

        const event = state.events.find(e => e._id === eventId);
        if (event) {
          event.comments = event.comments || [];
          event.comments.push(newComment);
        }
        if (state.selectedEvent?._id === eventId) {
          state.selectedEvent.comments = state.selectedEvent.comments || [];
          state.selectedEvent.comments.push(newComment);
        }
      })
      .addCase(leaveEventComment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(leaveEventReply.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(leaveEventReply.fulfilled, (state, action) => {
        state.loading = false;
        const { eventId, commentId, newReply } = action.payload;

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

        const event = state.events.find((e) => e._id === eventId);
        if (event && Array.isArray(event.comments)) {
          findAndInsertReply(event.comments);
        }
        if (state.selectedEvent?._id === eventId && Array.isArray(state.selectedEvent.comments)) {
          findAndInsertReply(state.selectedEvent.comments);
        }
      })
      .addCase(leaveEventReply.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(toggleEventCommentLike.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(toggleEventCommentLike.fulfilled, (state, action) => {
        state.loading = false;
        const { eventId, commentId, updatedLikes } = action.payload;

        const updateLikes = (comments) => {
          for (let comment of comments) {
            if (comment._id === commentId) {
              comment.likes = updatedLikes;
              return true;
            }
            if (Array.isArray(comment.replies) && updateLikes(comment.replies)) {
              return true;
            }
          }
          return false;
        };

        if (state.selectedEvent?._id === eventId && Array.isArray(state.selectedEvent.comments)) {
          updateLikes(state.selectedEvent.comments);
        }

        const event = state.events.find(e => e._id === eventId);
        if (event && Array.isArray(event.comments)) {
          updateLikes(event.comments);
        }
      })
      .addCase(toggleEventCommentLike.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(editEventCommentOrReply.fulfilled, (state, action) => {
        const { updatedComment } = action.payload;
        if (!updatedComment || !updatedComment._id) return;

        const updateCommentInList = (comments) => {
          for (let comment of comments) {
            if (comment._id === updatedComment._id) {
              const existingReplies = comment.replies;
              Object.assign(comment, updatedComment);
              if (existingReplies) {
                comment.replies = existingReplies;
              }
              return true;
            }
            if (comment.replies && updateCommentInList(comment.replies)) return true;
          }
          return false;
        };

        for (let event of state.events) {
          if (Array.isArray(event.comments)) {
            if (updateCommentInList(event.comments)) break;
          }
        }

        if (
          state.selectedEvent &&
          Array.isArray(state.selectedEvent.comments)
        ) {
          updateCommentInList(state.selectedEvent.comments);
        }
      })
      .addCase(editEventCommentOrReply.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(deleteEventCommentOrReply.fulfilled, (state, action) => {
        const { postId, commentId } = action.payload;

        const event = state.events.find(e => e._id === postId);
        if (!event || !event.comments) return;

        const removeComment = (comments) => {
          const index = comments.findIndex(c => c._id === commentId);
          if (index !== -1) {
            comments.splice(index, 1);
            return true;
          }
          for (let c of comments) {
            if (c.replies && removeComment(c.replies)) return true;
          }
          return false;
        };

        removeComment(event.comments);

        if (state.selectedEvent?._id === postId && Array.isArray(state.selectedEvent.comments)) {
          removeComment(state.selectedEvent.comments);
        }
      })
      .addCase(deleteEventCommentOrReply.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(fetchEventById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEventById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedEvent = action.payload;
      })
      .addCase(fetchEventById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
  },
});

export default eventsSlice.reducer;

export const { resetEvents, resetSelectedEvent } = eventsSlice.actions;

export const selectEvents = (state) => state.events.events || [];
export const selectLoading = (state) => state.events.loading;
export const selectError = (state) => state.events.error;
export const selectSelectedEvent = (state) => state.events.selectedEvent;

