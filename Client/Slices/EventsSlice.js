import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { updateNearbySuggestionLikes } from "./GooglePlacesSlice";
import { updateEvents } from '../utils/posts/UpdateEvents';
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
    },
    applyEventUpdates: (state, action) => {
      const { postId, updates, debug, label } = action.payload || {};
      if (!postId || !updates) return;
      updateEvents({ state, postId, updates, debug, label });
    },
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

export const { resetEvents, resetSelectedEvent, applyEventUpdates } = eventsSlice.actions;

export const selectEvents = (state) => state.events.events || [];
export const selectLoading = (state) => state.events.loading;
export const selectError = (state) => state.events.error;
export const selectSelectedEvent = (state) => state.events.selectedEvent;
export const selectEventById = (state, id) =>
  state.events.events.find((e) => e._id === id);

