import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getUserToken } from '../functions';
import { STORIES_QUERY, STORIES_BY_USER_QUERY } from './GraphqlQueries/Fragments/storiesFragments';
import client from '../apolloClient';

// BASE URL
const BASE_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/stories`;

export const getUploadUrls = createAsyncThunk(
  'stories/getUploadUrls',
  async ({ fileName, fileNames = [], mediaType = 'photo' }, thunkAPI) => {
    try {
      const token = await getUserToken();

      const payload = {};
      if (fileName) payload.fileName = fileName;
      if (fileNames.length > 0) payload.fileNames = fileNames;
      payload.mediaType = mediaType;

      const res = await axios.post(`${BASE_URL}/upload-url`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return res.data;
    } catch (err) {
      console.error('❌ getUploadUrls failed:', err.message);
      if (err.response) {
        console.error('↪️ Status:', err.response.status);
        console.error('↪️ Data:', err.response.data);
      }

      return thunkAPI.rejectWithValue(err.response?.data || 'Failed to get upload URL(s)');
    }
  }
);

export const fetchStoriesByUserId = createAsyncThunk(
  'stories/fetchStoriesByUserId',
  async (userId, thunkAPI) => {
    try {
      const { data, errors } = await client.query({
        query: STORIES_BY_USER_QUERY,
        variables: { userId },
        fetchPolicy: 'network-only', // ensures it fetches fresh data
      });

      if (errors) {
        console.error('❌ GraphQL errors in fetchStoriesByUserId:', errors);
        return thunkAPI.rejectWithValue(errors[0]?.message || 'GraphQL error fetching stories');
      }

      if (!data?.getStoriesByUserId) {
        return thunkAPI.rejectWithValue('No stories found for user');
      }

      return { userId, stories: data.getStoriesByUserId };
    } catch (err) {
      console.error('❗ Apollo Client error in fetchStoriesByUserId:', err);
      return thunkAPI.rejectWithValue(
        err.message || 'Failed to fetch user stories'
      );
    }
  }
);

// Fetch all active stories
export const fetchStories = createAsyncThunk(
  'stories/fetchStories',
  async (userId, thunkAPI) => {
    try {
      const { data, errors } = await client.query({
        query: STORIES_QUERY,
        variables: { userId },
        fetchPolicy: 'network-only', // optional but recommended for real-time content like stories
      });

      if (errors) {
        console.error('❌ GraphQL errors in fetchStories:', errors);
        return thunkAPI.rejectWithValue(errors[0]?.message || 'GraphQL error fetching stories');
      }

      if (!data?.getStories) {
        return thunkAPI.rejectWithValue('No stories returned');
      }

      return data.getStories;
    } catch (err) {
      console.error('❗ Apollo Client error in fetchStories:', err);
      return thunkAPI.rejectWithValue(err.message || 'Failed to fetch stories');
    }
  }
);

// Post a new story and receive the presigned upload URL
export const postStory = createAsyncThunk(
  'stories/postStory',
  async (
    {
      fileName,
      mediaType,
      visibility = 'public',
      taggedUsers = [],
      segments = [],
      mediaKey,
      captions = [],
    },
    thunkAPI
  ) => {
    try {
      const token = await getUserToken();

      const payload = {
        fileName,
        mediaType,
        captions,
        visibility,
        taggedUsers,
        mediaKey,
      };

      // Only include segments for video posts
      if (mediaType === 'video' && segments.length > 0) {
        payload.segments = segments;
      }

      const res = await axios.post(`${BASE_URL}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return res.data.story;

    } catch (err) {
      if (err.response) {
        console.error('↪️ Status:', err.response.status);
        console.error('↪️ Data:', err.response.data);
      }

      return thunkAPI.rejectWithValue(
        err.response?.data || 'Failed to post story'
      );
    }
  }
);

export const postSharedStory = createAsyncThunk(
  'stories/postSharedStory',
  async ({ postType, originalPostId, caption = '', visibility = 'public' }, { rejectWithValue }) => {
    try {
      const token = await getUserToken();

      const response = await axios.post(
        `${BASE_URL}/from-post`,
        { postType, originalPostId, caption, visibility },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data; // story response from the backend
    } catch (error) {
      console.error('❌ postSharedStory error:', error?.response?.data || error.message);

      return rejectWithValue(
        error?.response?.data?.error || 'Failed to share post to story'
      );
    }
  }
);

// Edit an existing story
export const editStory = createAsyncThunk(
  'stories/editStory',
  async ({ storyId, caption, visibility, taggedUsers }, thunkAPI) => {
    try {
      const res = await axios.put(`${BASE_URL}/${storyId}`, {
        caption,
        visibility,
        taggedUsers,
      });
      return res.data.story;
    } catch (err) {
      return thunkAPI.rejectWithValue(err.response?.data || 'Failed to edit story');
    }
  }
);

// Delete a story
export const deleteStory = createAsyncThunk('stories/deleteStory', async (storyId, thunkAPI) => {
  try {
    const token = await getUserToken();

    const response = await axios.delete(`${BASE_URL}/${storyId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return storyId;
  } catch (err) {
    return thunkAPI.rejectWithValue(err.response?.data || 'Failed to delete story');
  }
});

const storiesSlice = createSlice({
  name: 'stories',
  initialState: {
    stories: [],
    storiesByUser: {},
    loading: false,
    error: null,
  },
  reducers: {
    clearStories: (state) => {
      state.stories = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch
      .addCase(fetchStories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStories.fulfilled, (state, action) => {
        state.loading = false;
        state.stories = action.payload;
      })
      .addCase(fetchStories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Post
      .addCase(postStory.fulfilled, (state, action) => {
        state.stories.unshift(action.payload);
      })
      .addCase(postStory.rejected, (state, action) => {
        state.error = action.payload;
      })

      // Edit
      .addCase(editStory.fulfilled, (state, action) => {
        const index = state.stories.findIndex((s) => s._id === action.payload._id);
        if (index !== -1) {
          state.stories[index] = action.payload;
        }
      })
      .addCase(editStory.rejected, (state, action) => {
        state.error = action.payload;
      })

      // Delete
      .addCase(deleteStory.fulfilled, (state, action) => {
        state.stories = state.stories.filter((story) => story._id !== action.payload);
      })
      .addCase(deleteStory.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(fetchStoriesByUserId.fulfilled, (state, action) => {
        const { userId, stories } = action.payload;
        state.storiesByUser[userId] = stories;
      })
      .addCase(fetchStoriesByUserId.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(postSharedStory.fulfilled, (state, action) => {
        state.stories.unshift(action.payload); // optional: update local cache
      })
      .addCase(postSharedStory.rejected, (state, action) => {
        state.error = action.payload;
      })
  },
});

export const { clearStories } = storiesSlice.actions;

export const selectStories = state => state.stories.stories;

export default storiesSlice.reducer;
