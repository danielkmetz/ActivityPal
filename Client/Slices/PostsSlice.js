import { createSlice, createAsyncThunk, createSelector } from "@reduxjs/toolkit";
import { GET_USER_ACTIVITY_QUERY } from "./GraphqlQueries/Queries/getUserActivity";
import { GET_USER_POSTS_QUERY } from "./GraphqlQueries/Queries/getUserPosts";
import { GET_POSTS_BY_PLACE_QUERY } from "./GraphqlQueries/Queries/getPostsByPlace"; // now returns Post[]
import { updatePostCollections } from "../utils/posts/UpdatePostCollections";
import { getUserToken } from "../functions";
import client from "../apolloClient";
import axios from "axios";

const BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const INVITES_API = `${process.env.EXPO_PUBLIC_SERVER_URL}/activity-invite`;

/* ---------------------------- local helpers ---------------------------- */
const _toStr = (v) => (v == null ? "" : String(v));
const _getTimeFromPost = (p) => {
  const raw = p?.sortDate || p?.createdAt || p?.date;
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
};

const _toId = (x) => (x && (x._id || x.id)) ? String(x._id || x.id) : "";
const _isSharedPost = (p) => {
  const t = p?.type || p?.postType || p?.canonicalType;
  return t === "sharedPost" || t === "sharedPosts";
};

const _findInsertIndexDesc = (arr, ts, tieId) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const midTs = _getTimeFromPost(arr[mid]);
    if (midTs > ts) {
      lo = mid + 1; // newer → right
    } else if (midTs < ts) {
      hi = mid;     // older → left
    } else {
      const midId = _toStr(arr[mid]?._id || arr[mid]?.id);
      if (midId < tieId) lo = mid + 1;
      else hi = mid;
    }
  }
  return lo;
};

const _upsertInDateOrder = (arr, post) => {
  if (!Array.isArray(arr) || !post) return;
  const id = post?._id || post?.id;
  if (!id) return;
  const idx = arr.findIndex((p) => (p?._id || p?.id) === id);
  if (idx !== -1) arr.splice(idx, 1);
  const ts = _getTimeFromPost(post);
  const at = _findInsertIndexDesc(arr, ts, _toStr(id));
  arr.splice(at, 0, post);
};

/* -------------------------------- thunks ------------------------------- */

/** DELETE /posts/:postId (unified) */
export const deletePost = createAsyncThunk(
  "posts/deletePost",
  async ({ postId }, { rejectWithValue }) => {
    try {
      const res = await axios.delete(`${BASE_URL}/posts/${postId}`);
      return { postId, server: res.data };
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Failed to delete post";
      return rejectWithValue(msg);
    }
  }
);

/** POST /posts (unified) — accepts your final payload shape for any type */
export const createPost = createAsyncThunk(
  "posts/createPost",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await axios.post(`${BASE_URL}/posts`, payload);
      // Expecting { post } or the post itself; normalize:
      const post = res.data?.post ?? res.data;
      return post;
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Failed to create post";
      return rejectWithValue(msg);
    }
  }
);

/** PATCH /posts/:postId (unified) */
export const updatePost = createAsyncThunk(
  "posts/updatePost",
  async ({ postId, updates }, { rejectWithValue }) => {
    try {
      const res = await axios.patch(`${BASE_URL}/posts/${postId}`, updates);
      const post = res.data?.post ?? res.data;
      return post;
    } catch (error) {
      const msg = error.response?.data?.message || error.message || "Failed to update post";
      return rejectWithValue(msg);
    }
  }
);

/** GET /posts/:postType/:postId (server returns normalized Post) */
export const fetchPostById = createAsyncThunk(
  "posts/fetchPostById",
  async ({ postType, postId }, { rejectWithValue }) => {
    try {
      const res = await axios.get(`${BASE_URL}/posts/${postId}`, {
        params: { type: postType },
      });
      // expecting the normalized post (or wrapped); normalize:
      return res.data?.post ?? res.data;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        return rejectWithValue({ status: 404, message: "Not Found" });
      }
      return rejectWithValue({
        status: status ?? 0,
        message: err?.response?.data?.message || err?.message || "Failed to fetch post",
      });
    }
  }
);

/** GraphQL: Posts authored by a user */
export const fetchPostsByUserId = createAsyncThunk(
  "posts/fetchPostsByUserId",
  async ({ userId, limit = 15, after }, { rejectWithValue }) => {
    // ---- logging helpers (dev-only) ----
    const TAG = "[fetchPostsByUserId]";
    const ts = () => new Date().toISOString();
    const log = (...args) => { if (__DEV__) console.log(TAG, ...args); };
    const group = (label) => { if (__DEV__) console.group?.(TAG, label); };
    const groupEnd = () => { if (__DEV__) console.groupEnd?.(); };

    // Avoid dumping huge objects in logs
    const safeVars = {
      userId: String(userId || ""),
      types: ["review", "check-in"],
      limit,
      after: after
        ? { sortDate: String(after.sortDate || ""), id: String(after.id || "") }
        : null,
    };

    const t0 = Date.now();
    group(`start ${ts()}`);
    log("vars:", safeVars);

    try {
      const variables = {
        userId,
        types: ["review", "check-in"], // filter explicitly
        limit,
        after,
      };

      const { data, errors, networkStatus } = await client.query({
        query: GET_USER_POSTS_QUERY,
        variables,
        fetchPolicy: "network-only",
        notifyOnNetworkStatusChange: true,
      });

      log("networkStatus:", networkStatus);

      if (errors?.length) {
        log("graphql errors:", errors.map((e) => e.message));
        groupEnd();
        return rejectWithValue(errors.map((e) => e.message).join("; "));
      }

      const posts = Array.isArray(data?.getUserPosts) ? data.getUserPosts : [];
      const sampleIds = posts.slice(0, 5).map((p) => String(p?._id || p?.id || ""));
      log("result count:", posts.length, "sampleIds:", sampleIds);

      const ms = Date.now() - t0;
      log(`done in ${ms}ms`);
      groupEnd();
      return posts;
    } catch (error) {
      const gqlMsgs = error?.graphQLErrors?.map((e) => e.message).join("; ");
      const netMsg = error?.networkError?.message;
      const finalMsg = gqlMsgs || netMsg || error?.message || "Failed to fetch posts via GraphQL";

      log("caught error:", finalMsg);
      if (__DEV__ && error?.stack) console.log(TAG, "stack:", error.stack);
      groupEnd();
      return rejectWithValue(finalMsg);
    }
  }
);

/** GraphQL: Other user profile posts */
export const fetchPostsByOtherUserId = createAsyncThunk(
  "posts/fetchPostsByOtherUserId",
  async ({ userId, limit, after }, { rejectWithValue }) => {
    try {
      const variables = { userId, limit, after };
      const { data, errors } = await client.query({
        query: GET_USER_POSTS_QUERY,
        variables,
        fetchPolicy: "network-only",
      });
      if (errors?.length) {
        return rejectWithValue(errors.map((e) => e.message).join("; "));
      }
      return data?.getUserPosts || [];
    } catch (error) {
      return rejectWithValue(
        error.graphQLErrors?.map((e) => e.message).join("; ") ||
        error.networkError?.message ||
        error.message ||
        "Failed to fetch posts via GraphQL"
      );
    }
  }
);

/** GraphQL: User + following feed */
export const fetchUserActivity = createAsyncThunk(
  "posts/fetchUserActivity",
  async ({ limit = 15, after, userLat, userLng }, { rejectWithValue }) => {
    try {
      const token = await getUserToken();
      const { data, errors } = await client.query({
        query: GET_USER_ACTIVITY_QUERY,
        variables: { limit, after, userLat, userLng },
        fetchPolicy: "network-only",
        context: { headers: { Authorization: token ? `Bearer ${token}` : "" } },
      });
      if (errors?.length) {
        throw new Error(errors.map((e) => e.message).join("; "));
      }
      if (!data?.getUserActivity) {
        throw new Error("GraphQL response did not return expected data");
      }
      return data.getUserActivity;
    } catch (error) {
      return rejectWithValue(error.message || "Failed to fetch user activity via GraphQL");
    }
  }
);

/** GraphQL: Business page (reviews + check-ins → unified posts) */
export const fetchBusinessPosts = createAsyncThunk(
  "posts/fetchBusinessPosts",
  async ({ placeId, limit = 10, after = null }, { rejectWithValue }) => {
    try {
      const { data, errors } = await client.query({
        query: GET_POSTS_BY_PLACE_QUERY, // already refactored to Post
        variables: { placeId, limit, after },
      });
      if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
      return data.getPostsByPlace;
    } catch (error) {
      return rejectWithValue(error.message || "Failed to fetch business posts via GraphQL");
    }
  }
);

/** Optionally fetch my invites; upsert into userAndFriendsPosts */
export const fetchMyInvites = createAsyncThunk(
  'posts/fetchMyInvites',
  async (userId, { rejectWithValue }) => {
    try {
      const { data } = await axios.get(`${INVITES_API}/user/${userId}/invites`);
      return Array.isArray(data?.invites) ? data.invites : [];
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to fetch invites');
    }
  }
);

/** Send invite → add to feeds */
export const sendInvite = createAsyncThunk(
  'posts/sendInvite',
  async (inviteData, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await axios.post(`${INVITES_API}/send`, inviteData);
      const post = data?.invite;
      if (post) dispatch({ type: 'posts/addPostToFeeds', payload: post });
      return post ?? null;
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to send invite');
    }
  }
);

/** Accept invite → replace everywhere */
export const acceptInvite = createAsyncThunk(
  'posts/acceptInvite',
  async ({ recipientId, inviteId }, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await axios.post(`${INVITES_API}/accept`, { recipientId, inviteId });
      const post = data?.invite;
      if (post) dispatch({ type: 'posts/replacePostInFeeds', payload: post });
      return post ?? null;
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to accept invite');
    }
  }
);

/** Reject invite → replace everywhere */
export const rejectInvite = createAsyncThunk(
  'posts/rejectInvite',
  async ({ recipientId, inviteId }, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await axios.post(`${INVITES_API}/reject`, { recipientId, inviteId });
      const post = data?.invite;
      if (post) dispatch({ type: 'posts/replacePostInFeeds', payload: post });
      return post ?? null;
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to reject invite');
    }
  }
);

/** Edit invite (sender only) → replace everywhere */
export const editInvite = createAsyncThunk(
  'posts/editInvite',
  async ({ recipientId, inviteId, updates, recipientIds }, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await axios.put(`${INVITES_API}/edit`, { recipientId, inviteId, updates, recipientIds });
      const post = data?.updatedInvite;
      if (post) dispatch({ type: 'posts/replacePostInFeeds', payload: post });
      return post ?? null;
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to edit invite');
    }
  }
);

/** Delete invite → remove from feeds */
export const deleteInvite = createAsyncThunk(
  'posts/deleteInvite',
  async ({ senderId, inviteId, recipientIds }, { rejectWithValue, dispatch }) => {
    try {
      await axios.delete(`${INVITES_API}/delete`, { data: { senderId, inviteId, recipientIds } });
      dispatch({ type: 'posts/removePostFromFeeds', payload: { postId: inviteId } });
      return inviteId;
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to delete invite');
    }
  }
);

/** Ask to join someone else’s invite → replace everywhere */
export const requestInvite = createAsyncThunk(
  'posts/requestInvite',
  async ({ userId, inviteId }, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await axios.post(`${INVITES_API}/request`, { userId, inviteId });
      const post = data?.invite;
      if (post) dispatch({ type: 'posts/replacePostInFeeds', payload: post });
      return post ?? null;
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to request invite');
    }
  }
);

/** Accept a user’s request to join → replace everywhere */
export const acceptInviteRequest = createAsyncThunk(
  'posts/acceptInviteRequest',
  async ({ inviteId, userId }, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await axios.post(`${INVITES_API}/accept-user-request`, { inviteId, userId });
      const post = data?.invite;
      if (post) dispatch({ type: 'posts/replacePostInFeeds', payload: post });
      return post ?? null;
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to accept request');
    }
  }
);

/** Reject a user’s request to join → replace everywhere */
export const rejectInviteRequest = createAsyncThunk(
  'posts/rejectInviteRequest',
  async ({ inviteId, userId }, { rejectWithValue, dispatch }) => {
    try {
      const { data } = await axios.post(`${INVITES_API}/reject-user-request`, { inviteId, userId });
      const post = data?.invite;
      if (post) dispatch({ type: 'posts/replacePostInFeeds', payload: post });
      return post ?? null;
    } catch (err) {
      return rejectWithValue(err.response?.data || 'Failed to reject request');
    }
  }
);

/* --------------------------------- slice -------------------------------- */

const postsSlice = createSlice({
  name: "posts",
  initialState: {
    businessPosts: [],
    localPosts: [],
    profilePosts: [],
    otherUserPosts: [],
    userAndFriendsPosts: [],
    userAndFriendsRefreshNonce: null,
    suggestedPosts: [],
    hasFetchedOnce: false,
    selectedPost: null,
    loading: "idle",
    error: null,
  },
  reducers: {
    updateSharedPostInPosts: (state, action) => {
      const { postId, updates } = action.payload;
      updatePostCollections({
        state,
        postId,
        updates,
        postKeys: [
          "userAndFriendsPosts",
          "profilePosts",
          "otherUserPosts",
          "businessPosts",
          "suggestedPosts",
        ],
      });
    },
    invalidateUserAndFriendsFeed(state) {
      state.userAndFriendsRefreshNonce = (state.userAndFriendsRefreshNonce ?? 0) + 1;
    },
    resetProfilePosts: (state) => {
      state.profilePosts = [];
      state.loading = "idle";
      state.error = null;
    },
    setSuggestedPosts: (state, action) => {
      state.suggestedPosts = action.payload;
    },
    setHasFetchedOnce: (state, action) => {
      state.hasFetchedOnce = action.payload;
    },
    resetOtherUserPosts: (state) => {
      state.otherUserPosts = [];
    },
    resetBusinessPosts: (state) => {
      state.businessPosts = [];
    },
    clearSelectedPost: (state) => {
      state.selectedPost = null;
      state.error = null;
    },
    setUserAndFriendsPosts: (state, action) => {
      state.userAndFriendsPosts = [...action.payload];
    },
    appendUserAndFriendsPosts: (state, action) => {
      state.userAndFriendsPosts = [...state.userAndFriendsPosts, ...action.payload];
    },
    appendProfilePosts: (state, action) => {
      state.profilePosts = [...state.profilePosts, ...action.payload];
    },
    appendOtherUserPosts: (state, action) => {
      state.otherUserPosts = [...state.otherUserPosts, ...action.payload];
    },
    appendBusinessPosts: (state, action) => {
      state.businessPosts = [...state.businessPosts, ...action.payload];
    },
    setProfilePosts: (state, action) => {
      state.profilePosts = [...action.payload];
    },
    setBusinessPosts: (state, action) => {
      state.businessPosts = [...action.payload];
    },
    setOtherUserPosts: (state, action) => {
      state.otherUserPosts = [...action.payload];
    },
    setSelectedPost: (state, action) => {
      state.selectedPost = action.payload;
    },
    addPostToFeeds: (state, action) => {
      const newPost = action.payload;
      const newId = newPost?._id || newPost?.id;
      const upsert = (arr) => {
        if (!Array.isArray(arr)) return;
        const idx = arr.findIndex((p) => (p?._id || p?.id) === newId);
        if (idx !== -1) {
          arr[idx] = { ...arr[idx], ...newPost };
        } else {
          arr.unshift(newPost);
        }
      };
      upsert(state.profilePosts);
      upsert(state.userAndFriendsPosts);
    },
    updatePostInState: (state, action) => {
      const updatedPost = action.payload;
      const updateInArray = (array = []) => {
        const index = array.findIndex((post) => (post?._id || post?.id) === (updatedPost?._id || updatedPost?.id));
        if (index !== -1) array[index] = updatedPost;
      };
      updateInArray(state.userAndFriendsPosts);
      updateInArray(state.profilePosts);
      updateInArray(state.otherUserPosts);
      updateInArray(state.businessPosts);
      updateInArray(state.suggestedPosts);
    },
    resetAllPosts: (state) => {
      state.profilePosts = [];
      state.userAndFriendsPosts = [];
      state.otherUserPosts = [];
      state.businessPosts = [];
    },
    applyPostUpdates(state, action) {
      const { postId, updates = {}, postKeys = [] } = action?.payload || {};
      if (!postId) return;
      updatePostCollections({ state, postId, updates, postKeys });
    },
    applyBulkPostUpdates(state, action) {
      const items = Array.isArray(action.payload) ? action.payload : [];
      for (const { postId, updates = {}, postKeys = [] } of items) {
        if (!postId || !updates) continue;
        updatePostCollections({ state, postId, updates, postKeys });
      }
    },
    removePostFromFeeds: (state, action) => {
      const postId = action?.payload?.postId ?? action?.payload;
      if (!postId) return;
      const notThis = (p) => (p?._id || p?.id) !== postId;
      state.userAndFriendsPosts = (state.userAndFriendsPosts || []).filter(notThis);
      state.profilePosts = (state.profilePosts || []).filter(notThis);
      state.otherUserPosts = (state.otherUserPosts || []).filter(notThis);
      state.businessPosts = (state.businessPosts || []).filter(notThis);
      state.suggestedPosts = (state.suggestedPosts || []).filter(notThis);
    },
    replacePostInFeeds: (state, action) => {
      const updated = action.payload;
      const updatedId = _toId(updated);
      if (!updatedId) return;

      const updateArray = (arr = []) =>
        arr.map((item) => {
          if (!item) return item;
          if (_toId(item) === updatedId) return updated;
          if (_isSharedPost(item)) {
            const originalId = _toId(item.original) || String(item.originalPostId || "");
            if (originalId && originalId === updatedId) {
              return { ...item, original: updated };
            }
          }
          return item;
        });

      state.userAndFriendsPosts = updateArray(state.userAndFriendsPosts);
      state.profilePosts = updateArray(state.profilePosts);
      state.otherUserPosts = updateArray(state.otherUserPosts);
      state.businessPosts = updateArray(state.businessPosts);
      state.suggestedPosts = updateArray(state.suggestedPosts);
    },
    removeUserPostsFromUserAndFriends: (state, action) => {
      const uid = String(action.payload ?? "");
      if (!uid) return;

      const toStr = (v) => (v == null ? "" : String(v));
      const isFromUser = (post) => {
        if (!post) return false;
        const ids = [
          post.userId,
          post.authorId,
          post.ownerId,
          post.createdBy,
          post.owner?.id, // unified owner block
          post.sharedBy && (post.sharedBy.userId || post.sharedBy._id || post.sharedBy.id || post.sharedBy),
          post.sender && (post.sender.userId || post.sender._id || post.sender.id),
          post.original && (post.original.userId || post.original.authorId || post.original.ownerId || post.original.createdBy),
          post.original?.sender && (post.original.sender.userId || post.original.sender._id || post.original.sender.id),
          post.original?.owner?.id,
        ].filter(Boolean).map(toStr);
        return ids.includes(uid);
      };

      state.userAndFriendsPosts = (state.userAndFriendsPosts || []).filter((p) => !isFromUser(p));
    },
    addPostBackToProfileByCreatedAt(state, action) {
      let post = action.payload?.item ?? action.payload;
      if (!post) return;
      post = post.post || post.original || post;
      const id = post?._id || post?.id;
      if (!id) return;
      if (!Array.isArray(state.profilePosts)) state.profilePosts = [];
      _upsertInDateOrder(state.profilePosts, post);
    },
    addPostBackToUserAndFriendsByCreatedAt(state, action) {
      let post = action.payload?.item ?? action.payload;
      if (!post) return;
      post = post.post || post.original || post;
      const id = post?._id || post?.id;
      if (!id) return;
      if (!Array.isArray(state.userAndFriendsPosts)) state.userAndFriendsPosts = [];
      _upsertInDateOrder(state.userAndFriendsPosts, post);
    },
  },
  extraReducers: (builder) => {
    builder
      /* delete */
      .addCase(deletePost.pending, (state) => {
        state.loading = "pending"; state.error = null;
      })
      .addCase(deletePost.fulfilled, (state, action) => {
        state.loading = "idle";
        const deletedId = action.meta.arg.postId;
        const notThis = (p) => (p?._id || p?.id) !== deletedId;
        state.userAndFriendsPosts = (state.userAndFriendsPosts || []).filter(notThis);
        state.profilePosts = (state.profilePosts || []).filter(notThis);
        state.otherUserPosts = (state.otherUserPosts || []).filter(notThis);
        state.businessPosts = (state.businessPosts || []).filter(notThis);
        state.suggestedPosts = (state.suggestedPosts || []).filter(notThis);
      })
      .addCase(deletePost.rejected, (state, action) => {
        state.loading = "idle"; state.error = action.payload;
      })

      /* create */
      .addCase(createPost.pending, (state) => {
        state.loading = "pending"; state.error = null;
      })
      .addCase(createPost.fulfilled, (state, action) => {
        state.loading = "idle";
        const post = action.payload;
        if (!Array.isArray(state.userAndFriendsPosts)) state.userAndFriendsPosts = [];
        if (!Array.isArray(state.profilePosts)) state.profilePosts = [];
        _upsertInDateOrder(state.userAndFriendsPosts, post);
        _upsertInDateOrder(state.profilePosts, post);
      })
      .addCase(createPost.rejected, (state, action) => {
        state.loading = "idle"; state.error = action.payload;
      })

      /* update */
      .addCase(updatePost.pending, (state) => {
        state.loading = "loading"; state.error = null;
      })
      .addCase(updatePost.fulfilled, (state, action) => {
        state.loading = "succeeded";
        const updated = action.payload;
        const updatedId = (updated?._id || updated?.id) ?? "";

        const updateArray = (arr = []) =>
          arr.map((item) => {
            if (!item) return item;
            const itemId = item?._id || item?.id;
            if (itemId === updatedId) return updated;
            // update nested originals inside shared posts
            const t = item?.type || item?.postType || item?.canonicalType;
            if (t === "sharedPost" || t === "sharedPosts") {
              const originalId = item?.original?._id || item?.original?.id || item?.originalPostId;
              if (String(originalId) === String(updatedId)) {
                return { ...item, original: updated };
              }
            }
            return item;
          });

        state.userAndFriendsPosts = updateArray(state.userAndFriendsPosts);
        state.profilePosts = updateArray(state.profilePosts);
        state.otherUserPosts = updateArray(state.otherUserPosts);
        state.businessPosts = updateArray(state.businessPosts);
        state.suggestedPosts = updateArray(state.suggestedPosts);
      })
      .addCase(updatePost.rejected, (state, action) => {
        state.loading = "failed"; state.error = action.payload || "Error updating post";
      })

      /* GQL feeds */
      .addCase(fetchPostsByUserId.pending, (state) => {
        state.loading = "pending"; state.error = null;
      })
      .addCase(fetchPostsByUserId.fulfilled, (state) => {
        state.loading = "idle";
      })
      .addCase(fetchPostsByUserId.rejected, (state, action) => {
        state.loading = "idle"; state.error = action.payload;
      })

      .addCase(fetchPostsByOtherUserId.pending, (state) => {
        state.loading = "pending"; state.error = null;
      })
      .addCase(fetchPostsByOtherUserId.fulfilled, (state) => {
        state.loading = "idle";
      })
      .addCase(fetchPostsByOtherUserId.rejected, (state, action) => {
        state.loading = "idle"; state.error = action.payload;
      })

      .addCase(fetchBusinessPosts.pending, (state) => {
        state.loading = "pending"; state.error = null;
      })
      .addCase(fetchBusinessPosts.fulfilled, (state) => {
        state.loading = "idle";
      })
      .addCase(fetchBusinessPosts.rejected, (state, action) => {
        state.loading = "idle"; state.error = action.payload;
      })

      .addCase(fetchUserActivity.pending, (state) => {
        state.loading = "pending"; state.error = null;
      })
      .addCase(fetchUserActivity.fulfilled, (state) => {
        state.loading = "idle";
      })
      .addCase(fetchUserActivity.rejected, (state, action) => {
        state.loading = "idle"; state.error = action.payload;
      })

      .addCase(fetchPostById.pending, (state) => {
        state.loading = true; state.error = null;
      })
      .addCase(fetchPostById.fulfilled, (state, action) => {
        state.selectedPost = action.payload; state.loading = false;
      })
      .addCase(fetchPostById.rejected, (state, action) => {
        state.error = action.payload; state.loading = false;
      })
      .addCase(fetchMyInvites.pending, (state) => {
        state.loading = 'pending'; state.error = null;
      })
      .addCase(fetchMyInvites.fulfilled, (state, action) => {
        state.loading = 'idle';
        const arr = Array.isArray(state.userAndFriendsPosts) ? state.userAndFriendsPosts : (state.userAndFriendsPosts = []);
        for (const inv of action.payload || []) {
          // upsert by id, keep feed order using your helper
          const id = inv?._id || inv?.id;
          if (!id) continue;
          const idx = arr.findIndex(p => (p?._id || p?.id) === id);
          if (idx === -1) {
            arr.unshift(inv); // invites are recent; push on top
          } else {
            arr[idx] = inv;
          }
        }
      })
      .addCase(fetchMyInvites.rejected, (state, action) => {
        state.loading = 'idle'; state.error = action.payload || action.error?.message;
      })
  },
});

export default postsSlice.reducer;

/* -------------------------------- actions ------------------------------- */
export const {
  updateSharedPostInPosts,
  invalidateUserAndFriendsFeed,
  resetProfilePosts,
  setSuggestedPosts,
  setHasFetchedOnce,
  resetOtherUserPosts,
  resetBusinessPosts,
  clearSelectedPost,
  setUserAndFriendsPosts,
  appendUserAndFriendsPosts,
  appendProfilePosts,
  appendOtherUserPosts,
  appendBusinessPosts,
  setProfilePosts,
  setBusinessPosts,
  setOtherUserPosts,
  setSelectedPost,
  addPostToFeeds,
  updatePostInState,
  resetAllPosts,
  applyPostUpdates,
  applyBulkPostUpdates,
  removePostFromFeeds,
  replacePostInFeeds,
  removeUserPostsFromUserAndFriends,
  addPostBackToUserAndFriendsByCreatedAt,
  addPostBackToProfileByCreatedAt,
} = postsSlice.actions;

/* ------------------------------- selectors ------------------------------ */
export const selectAllPosts = createSelector(
  [
    (state) => state.posts.businessPosts || [],
    (state) => state.posts.userAndFriendsPosts || [],
    (state) => state.posts.otherUserPosts || [],
    (state) => state.posts.profilePosts || [],
    (state) => state.posts.suggestedPosts || [],
  ],
  (business, userAndFriends, otherUser, profile, suggested) => [
    ...business,
    ...userAndFriends,
    ...otherUser,
    ...profile,
    ...suggested,
  ]
);

export const selectProfilePosts = (state) => state.posts.profilePosts || [];
export const selectHasFetchedOnce = (state) => state.posts.hasFetchedOnce;
export const selectBusinessPosts = (state) => state.posts.businessPosts || [];
export const selectOtherUserPosts = (state) => state.posts.otherUserPosts || [];
export const selectLoading = (state) => state.posts.loading;
export const selectError = (state) => state.posts.error;
export const selectLocalPosts = (state) => state.posts.localPosts || [];
export const selectUserAndFriendsPosts = (state) => state.posts.userAndFriendsPosts || [];
export const selectSuggestedPosts = (state) => state.posts.suggestedPosts || [];
export const selectSelectedPost = (state) => state.posts.selectedPost;
export const selectPostById = createSelector(
  [selectAllPosts, (_state, postId) => postId],
  (allPosts, postId) => allPosts.find((p) => (p?._id || p?.id) === postId) || null
);
export const selectUserAndFriendsRefreshNonce = (s) => s.posts.userAndFriendsRefreshNonce;
