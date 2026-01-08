import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import client from '../apolloClient';
import { GET_USER_INVITES_QUERY } from './GraphqlQueries/Queries/getUserInvites';
import { nudgeInviteRecipient } from './PostsSlice';

const EMPTY_ARRAY = [];
const EMPTY_OBJECT = Object.freeze({});

// If you have invitesSlice initialState exported, use that instead of this.
const FALLBACK_INVITES_STATE = Object.freeze({
  ids: EMPTY_ARRAY,
  byId: EMPTY_OBJECT,
  activeId: null,
  status: 'idle',
  error: null,
  cursor: null,
});

/**
 * Thunk: fetch all invites involving the current user via GraphQL getUserInvites.
 * - Uses POST_FIELDS fragment so we get consistent hydration (details.needsRecap etc).
 * - Upserts into PostsSlice.
 * - Keeps IDs + cursor locally for UI.
 */
export const fetchUserInvites = createAsyncThunk(
  'invites/fetchUserInvites',
  async ({ limit = 100, after = null } = {}, { dispatch, rejectWithValue }) => {
    try {
      const { data, errors } = await client.query({
        query: GET_USER_INVITES_QUERY,
        variables: { limit, after },
        fetchPolicy: 'network-only', // always hit server for freshest invite state
      });

      if (errors && errors.length) {
        const msg = errors[0]?.message || 'GraphQL error';
        return rejectWithValue({ message: msg });
      }

      const invites = data?.getUserInvites || [];

      let lastCursor = null;
      if (invites.length > 0) {
        const last = invites[invites.length - 1];
        lastCursor = {
          sortDate: last.sortDate,
          id: last._id,
        };
      }

      return {
        invites,                            // ⬅️ full objects
        ids: invites.map((p) => p._id),     // still keep ids for ordering
        cursor: lastCursor,
        append: !!after,                    // pagination flag
      };
    } catch (err) {
      const message = err.message || 'Failed to fetch invites';
      return rejectWithValue({ message });
    }
  }
);

const invitesSlice = createSlice({
  name: 'invites',
  initialState: {
    ids: [],        // invite Post IDs involving current user, ordered
    byId: {},       // id -> full invite object
    activeId: null,
    status: 'idle',
    error: null,
    cursor: null,
  },
  reducers: {
    setActiveInvite(state, action) {
      state.activeId = action.payload || null;
    },
    setInviteNeedsRecap(state, action) {
      const { inviteId, needsRecap } = action.payload || {};
      if (!inviteId || typeof needsRecap !== 'boolean') return;

      // ensure id is tracked
      if (!state.ids.includes(inviteId)) {
        state.ids.push(inviteId);
      }

      // update local object if we have it
      if (state.byId[inviteId]) {
        state.byId[inviteId] = {
          ...state.byId[inviteId],
          details: {
            ...(state.byId[inviteId].details || {}),
            needsRecap,
          },
        };
      }

      // rotate activeId if needed
      if (!needsRecap && state.activeId === inviteId) {
        const idx = state.ids.indexOf(inviteId);
        if (idx !== -1) {
          const remaining = state.ids
            .slice(idx + 1)
            .concat(state.ids.slice(0, idx));
          state.activeId = remaining.length > 0 ? remaining[0] : null;
        } else {
          state.activeId = null;
        }
      }

      if (needsRecap && !state.activeId) {
        state.activeId = inviteId;
      }
    },
    removeInvite(state, action) {
      const inviteId = action.payload;
      state.ids = state.ids.filter((id) => id !== inviteId);
      if (state.byId[inviteId]) {
        delete state.byId[inviteId];
      }
      if (state.activeId === inviteId) {
        state.activeId = null;
      }
    },
    clearInvites(state) {
      state.ids = [];
      state.byId = {};
      state.activeId = null;
      state.status = 'idle';
      state.error = null;
      state.cursor = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserInvites.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchUserInvites.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const {
          ids = [],
          invites = [],
          cursor = null,
          append = false,
        } = action.payload || {};

        if (!append) {
          // initial load / refresh: replace everything
          state.ids = [];
          state.byId = {};
        }

        // normalize and upsert
        invites.forEach((invite) => {
          if (!invite || !invite._id) return;
          const id = invite._id;

          const alreadyHave = state.ids.includes(id);
          if (!alreadyHave) {
            state.ids.push(id);
          }

          state.byId[id] = invite; // upsert full object
        });

        state.cursor = cursor || null;

        // Pick a default active invite only if none is set
        if (!state.activeId && state.ids.length > 0) {
          state.activeId = state.ids[0];
        }
      })
      .addCase(fetchUserInvites.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          action.payload?.message ||
          action.error?.message ||
          'Failed to fetch invites';
      })
      .addCase(nudgeInviteRecipient.fulfilled, (state, action) => {
        const invite = action.payload;
        if (!invite || !invite._id) return;

        const id = invite._id;

        // ensure we track it
        if (!state.ids.includes(id)) {
          state.ids.push(id);
        }

        // overwrite the invite in byId so details.recipients[].nudgedAt is fresh
        state.byId[id] = invite;
      })
  },
});

export const {
  setActiveInvite,
  removeInvite,
  clearInvites,
  setInviteNeedsRecap,
} = invitesSlice.actions;

export default invitesSlice.reducer;

/* ---------------------- selectors ---------------------- */

const selectInvitesState = (state) => state.invites || FALLBACK_INVITES_STATE;

export const selectInviteIds = (state) => selectInvitesState(state).ids || EMPTY_ARRAY;
export const selectInvitesById = (state) => selectInvitesState(state).byId || EMPTY_OBJECT;
export const selectActiveInviteId = (state) => selectInvitesState(state).activeId;
export const selectInvitesStatus = (state) => selectInvitesState(state).status;
export const selectInvitesError = (state) => selectInvitesState(state).error;
export const selectInvitesCursor = (state) => selectInvitesState(state).cursor;

/**
 * All invite objects in slice order. (Memoized)
 */
export const selectMyInvites = createSelector(
  [selectInviteIds, selectInvitesById],
  (ids, byId) => {
    if (!Array.isArray(ids) || !byId) return EMPTY_ARRAY;

    // creates a new array ONLY when ids/byId references change
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const v = byId[ids[i]];
      if (v) out.push(v);
    }
    return out;
  }
);

/**
 * Recap-candidate invites (Memoized)
 */
export const selectRecapCandidateInvites = createSelector(
  [selectMyInvites],
  (invites) =>
    invites.filter((p) => p?.type === 'invite' && p?.details?.needsRecap === true)
);