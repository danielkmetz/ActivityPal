import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import {
  acceptInvite,
  rejectInvite,
  requestInvite,
  acceptInviteRequest,
  rejectInviteRequest,
  sendInvite,
  editInvite,
  nudgeInviteRecipient,
} from '../../Slices/PostsSlice';
import { createNotification, setNotifications, selectNotifications } from '../../Slices/NotificationsSlice';
import { selectUser } from '../../Slices/UserSlice';
import { runConflictCheckBeforeAccept } from './runConflictCheck';
import { toId } from '../Formatting/toId';

function normalizePhotos(input) {
  const list = Array.isArray(input) ? input.filter(Boolean) : [];
  if (!list.length) return [];

  const seen = new Set();
  const out = [];

  for (const p of list) {
    const k = p?.photoKey || p?.videoKey || p?.key || p?.localKey || p?.uri || p?._id;
    const key = k ? String(k) : null;

    if (key && seen.has(key)) continue;
    if (key) seen.add(key);

    out.push(p);
  }

  return out;
}

function sameId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/**
 * Build a VenueSchema-compatible payload for the backend.
 * Supports:
 *  - explicit venue object (place/custom)
 *  - legacy google place fields (placeId + businessName + location)
 *
 * VenueSchema:
 *   { kind:'place'|'custom', label, placeId?, address?, geo? }
 */
function buildVenuePayload({
  venue = null,
  placeId = null,
  businessName = null,
  location = null,
  address = null,
}) {
  // Explicit venue (preferred)
  if (venue && typeof venue === 'object') {
    const kind = String(venue.kind || '').trim();
    const label = String(venue.label || '').trim();

    if (kind !== 'place' && kind !== 'custom') {
      return { error: 'venue.kind must be "place" or "custom"' };
    }
    if (!label) {
      return { error: 'venue.label is required' };
    }

    if (kind === 'place') {
      const pid = String(venue.placeId || placeId || '').trim();
      if (!pid) return { error: 'venue.placeId is required for place venues' };

      return {
        venue: {
          kind: 'place',
          label,
          placeId: pid,
          address: null,
          geo: venue.geo || location || undefined,
        },
      };
    }

    // custom
    return {
      venue: {
        kind: 'custom',
        label,
        placeId: null,
        address: venue.address != null ? String(venue.address).trim() : (address != null ? String(address).trim() : null),
        geo: venue.geo || location || undefined,
      },
    };
  }

  // Legacy fallback (google places)
  const pid = typeof placeId === 'string' ? placeId.trim() : '';
  if (pid) {
    const label = String(businessName || '').trim() || 'Place';
    return {
      venue: {
        kind: 'place',
        label,
        placeId: pid,
        address: null,
        geo: location || undefined,
      },
    };
  }

  // No way to construct a valid venue
  return { error: 'Missing venue: provide venue OR placeId' };
}

export default function useInviteActions(invite) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const notifications = useSelector(selectNotifications) || [];

  const meId = toId(user?.id || user?._id);

  const postContent = invite?.original ?? invite ?? {};
  const inviteId = postContent?._id || invite?._id;

  const owner = postContent?.owner;
  const senderId = owner?.id || owner?._id || owner?.userId || null;

  // ✅ Use new schema field first
  const venueLabel =
    postContent?.venue?.label ||
    postContent?.businessName ||
    postContent?.business?.businessName ||
    'this event';

  /** -------- shared conflict-check wrapper for this invite/user -------- */
  const checkForConflictsBeforeAccept = useCallback(
    () =>
      runConflictCheckBeforeAccept({
        dispatch,
        userId: meId,
        inviteId,
      }),
    [dispatch, meId, inviteId]
  );

  /** -------------------- 1) Accept / decline for current user -------------------- */
  const isMyInviteNotification = (n, id) =>
    sameId(n?.targetId, id) &&
    (n?.type === 'activityInvite' || n?.type === 'activityInviteReminder');

  const acceptForMe = useCallback(async () => {
    if (!inviteId || !meId) return;

    const ok = await checkForConflictsBeforeAccept();
    if (!ok) return;

    try {
      await dispatch(acceptInvite({ recipientId: meId, inviteId })).unwrap();

      // Local UX patch (still okay, but not authoritative)
      const updated = notifications.map((n) =>
        isMyInviteNotification(n, inviteId)
          ? { ...n, type: 'activityInviteAccepted', message: 'You accepted the invite!' }
          : n
      );
      dispatch(setNotifications(updated));
    } catch (e) {
      console.warn('Failed to accept invite:', e?.message || e);
      Alert.alert('Error', 'Could not accept invite.');
    }
  }, [dispatch, inviteId, meId, checkForConflictsBeforeAccept, notifications]);

  const declineForMe = useCallback(async () => {
    if (!inviteId || !meId) return;

    try {
      await dispatch(rejectInvite({ recipientId: meId, inviteId })).unwrap();

      const updated = notifications.map((n) =>
        isMyInviteNotification(n, inviteId)
          ? { ...n, type: 'activityInviteDeclined', message: 'You declined the invite.' }
          : n
      );
      dispatch(setNotifications(updated));
    } catch (e) {
      console.warn('Failed to decline invite:', e?.message || e);
      Alert.alert('Error', 'Could not decline invite.');
    }
  }, [dispatch, inviteId, meId, notifications]);

  /** --------------------------- 2) Request to join --------------------------- */
  const requestToJoin = useCallback(async () => {
    if (!inviteId || !meId) return false;

    try {
      await dispatch(requestInvite({ userId: meId, inviteId })).unwrap();

      if (senderId) {
        await dispatch(
          createNotification({
            userId: senderId,
            type: 'requestInvite',
            message: `${user?.firstName || 'Someone'} wants to join your event at ${venueLabel}`,
            relatedId: meId,
            typeRef: 'User',
            targetId: inviteId,
            targetRef: 'Post',
            postType: 'invite',
          })
        ).unwrap();
      }

      Alert.alert('Request sent', 'Your request has been sent!');
      return true;
    } catch (err) {
      console.error('❌ Failed to request invite or send notification:', err);
      Alert.alert('Error', err?.message || 'Something went wrong.');
      return false;
    }
  }, [dispatch, inviteId, meId, senderId, venueLabel, user?.firstName]);

  /** ----------------- 3) Host: accept / reject join requests ----------------- */
  const acceptJoinRequest = useCallback(
    async (relatedId) => {
      if (!inviteId || !relatedId) return;

      try {
        await dispatch(acceptInviteRequest({ userId: relatedId, inviteId })).unwrap();

        // NOTE: Your typeRef/targetRef usage is inconsistent elsewhere.
        // If your backend expects targetRef:'Post', keep it consistent.
        await dispatch(
          createNotification({
            userId: relatedId,
            type: 'activityInviteAccepted',
            message: `${user?.firstName || ''} ${user?.lastName || ''} accepted your request to join the event.`,
            relatedId: meId,
            typeRef: 'User',
            targetId: inviteId,
            targetRef: 'Post',
            postType: 'invite',
          })
        ).unwrap();

        const filtered = notifications.filter(
          (n) => !(n.type === 'requestInvite' && sameId(n.relatedId, relatedId) && sameId(n.targetId, inviteId))
        );
        dispatch(setNotifications(filtered));
      } catch (err) {
        console.error('❌ Error accepting join request:', err);
      }
    },
    [dispatch, inviteId, meId, notifications, user?.firstName, user?.lastName]
  );

  const rejectJoinRequest = useCallback(
    async (relatedId) => {
      if (!inviteId || !relatedId) return;

      try {
        await dispatch(rejectInviteRequest({ userId: relatedId, inviteId })).unwrap();

        await dispatch(
          createNotification({
            userId: relatedId,
            type: 'activityInviteDeclined',
            message: `${user?.firstName || ''} ${user?.lastName || ''} declined your request to join the event.`,
            relatedId: meId,
            typeRef: 'User',
            targetId: inviteId,
            targetRef: 'Post',
            postType: 'invite',
          })
        ).unwrap();

        const filtered = notifications.filter(
          (n) => !(n.type === 'requestInvite' && sameId(n.relatedId, relatedId) && sameId(n.targetId, inviteId))
        );
        dispatch(setNotifications(filtered));
      } catch (err) {
        console.error('❌ Error rejecting join request:', err);
      }
    },
    [dispatch, inviteId, meId, notifications, user?.firstName, user?.lastName]
  );

  /** --------- 4) Create / edit helpers (NOW SUPPORT VENUE) --------- */
  const sendInviteWithConflicts = useCallback(
    async ({
      recipientIds,
      // legacy google place inputs (current UI)
      placeId,
      businessName: nameFromForm,
      location,
      // future: allow passing explicit venue
      venue,
      address, // future: custom venue address string
      dateTime,
      note,
      isPublic,
      photos,
      timeZone, // optional, if your form includes it
    }) => {
      if (!meId) return { cancelled: true };

      const ok = await runConflictCheckBeforeAccept({
        dispatch,
        userId: meId,
        dateTime,
      });
      if (!ok) return { cancelled: true };

      const venueResult = buildVenuePayload({
        venue,
        placeId,
        businessName: nameFromForm,
        location,
        address,
      });

      if (venueResult.error) {
        Alert.alert('Missing location', venueResult.error);
        return { cancelled: true };
      }

      const payload = {
        senderId: meId,
        recipientIds,
        dateTime,
        note,
        isPublic,
        timeZone,
        photos: normalizePhotos(photos),
        venue: venueResult.venue, // ✅ backend-ready
      };

      const result = await dispatch(sendInvite(payload)).unwrap();
      return { cancelled: false, result };
    },
    [dispatch, meId]
  );

  const editInviteWithConflicts = useCallback(
    async ({
      inviteIdOverride,
      updates, // can include: venue OR legacy placeId/businessName/location, plus dateTime/note/isPublic/photos/timeZone
      recipientIds,
    }) => {
      const targetInviteId = inviteIdOverride || inviteId;
      if (!meId || !targetInviteId) return { cancelled: true };

      const ok = await runConflictCheckBeforeAccept({
        dispatch,
        userId: meId,
        inviteId: targetInviteId,
        dateTime: updates?.dateTime,
      });
      if (!ok) return { cancelled: true };

      const cleanedUpdates = { ...(updates || {}) };

      // photos
      if (cleanedUpdates.photos) {
        cleanedUpdates.photos = normalizePhotos(cleanedUpdates.photos);
      }

      // venue (preferred) OR legacy place fields -> venue
      if (
        cleanedUpdates.venue ||
        cleanedUpdates.placeId ||
        cleanedUpdates.businessName ||
        cleanedUpdates.location ||
        cleanedUpdates.address
      ) {
        const venueResult = buildVenuePayload({
          venue: cleanedUpdates.venue || null,
          placeId: cleanedUpdates.placeId || null,
          businessName: cleanedUpdates.businessName || null,
          location: cleanedUpdates.location || null,
          address: cleanedUpdates.address || null,
        });

        if (venueResult.error) {
          Alert.alert('Invalid location', venueResult.error);
          return { cancelled: true };
        }

        cleanedUpdates.venue = venueResult.venue;

        // optional: stop sending legacy keys once venue is present
        delete cleanedUpdates.placeId;
        delete cleanedUpdates.businessName;
        delete cleanedUpdates.location;
        delete cleanedUpdates.address;
      }

      const result = await dispatch(
        editInvite({
          recipientId: meId, // your backend treats this as senderId in edit; keep until you rename
          inviteId: targetInviteId,
          updates: cleanedUpdates,
          recipientIds,
        })
      ).unwrap();

      return { cancelled: false, result };
    },
    [dispatch, meId, inviteId]
  );

  /** --------------------------- 5) Host: nudge recipient --------------------------- */
  const nudgeRecipient = useCallback(
    async (recipientId) => {
      if (!inviteId || !recipientId) return;

      const hostId = senderId || meId;
      if (!hostId) return;

      try {
        await dispatch(nudgeInviteRecipient({ inviteId, recipientId, senderId: hostId })).unwrap();
        Alert.alert('Reminder sent', 'We nudged them about this plan.');
      } catch (err) {
        console.error('❌ Failed to nudge recipient:', err);
        const msg = (typeof err === 'string' && err) || err?.message || 'Could not send reminder.';
        Alert.alert('Error', msg);
      }
    },
    [dispatch, inviteId, senderId, meId]
  );

  return {
    acceptForMe,
    declineForMe,
    requestToJoin,
    acceptJoinRequest,
    rejectJoinRequest,
    sendInviteWithConflicts,
    editInviteWithConflicts,
    nudgeRecipient,
  };
}
