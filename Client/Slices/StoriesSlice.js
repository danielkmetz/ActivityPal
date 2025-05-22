import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { getUserToken } from '../functions';

// BASE URL
const BASE_URL = `${process.env.EXPO_PUBLIC_SERVER_URL}/stories`;
const GRAPH_QL = `${process.env.EXPO_PUBLIC_SERVER_URL}/graphql`;

const STORIES_QUERY = `
  query UserAndFollowingStories($userId: ID!) {
    userAndFollowingStories(userId: $userId) {
      _id
      mediaKey
      mediaType
      caption
      visibility
      expiresAt
      mediaUrl
      profilePicUrl
      isViewed
      viewedBy {
        _id
        firstName
        lastName
        profilePicUrl
      }
      user {
        _id
        firstName
        lastName
      }
    }
  }
`;

const STORIES_BY_USER_QUERY = `
  query StoriesByUser($userId: ID!) {
    storiesByUser(userId: $userId) {
      _id
      mediaKey
      mediaType
      caption
      visibility
      expiresAt
      mediaUrl
      profilePicUrl
      isViewed
      viewedBy {
        _id
        firstName
        lastName
        profilePicUrl
      }
      user {
        _id
        firstName
        lastName
      }
    }
  }
`;

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
            const token = await getUserToken();

            const res = await axios.post(GRAPH_QL, {
                query: STORIES_BY_USER_QUERY,
                variables: { userId },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

            const data = res.data?.data?.storiesByUser;
            return { userId, stories: data };
        } catch (err) {
            console.error('GraphQL fetchStoriesByUserId error:', err);
            return thunkAPI.rejectWithValue(err.response?.data || 'Failed to fetch user stories');
        }
    }
);

// Fetch all active stories
export const fetchStories = createAsyncThunk('stories/fetchStories', async (userId, thunkAPI) => {
    try {
        const token = await getUserToken();

        const res = await axios.post(GRAPH_QL, {
            query: STORIES_QUERY,
            variables: { userId },
        },
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

        const data = res.data?.data?.userAndFollowingStories;
        return data;
    } catch (err) {
        console.error('GraphQL fetchStories error:', err);
        return thunkAPI.rejectWithValue(err.response?.data || 'Failed to fetch stories');
    }
});

// Post a new story and receive the presigned upload URL
export const postStory = createAsyncThunk(
  'stories/postStory',
  async (
    {
      fileName,
      mediaType,
      caption,
      visibility = 'public',
      taggedUsers = [],
      segments = [],
    },
    thunkAPI
  ) => {
    try {
      const token = await getUserToken();

      const payload = {
        fileName,
        mediaType,
        caption,
        visibility,
        taggedUsers,
      };

      // Only include segments for video posts
      if (mediaType === 'video' && segments.length > 0) {
        payload.segments = segments;
      }

      console.log('📡 POST /story — payload:', payload);

      const res = await axios.post(`${BASE_URL}`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log('✅ Server response:', res.data);
      return res.data.story;

    } catch (err) {
      console.error('❌ postStory failed');
      console.error('↪️', err.message);
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
    },
});

export const { clearStories } = storiesSlice.actions;

export const selectStories = state => state.stories.stories;

export default storiesSlice.reducer;
