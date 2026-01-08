const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const User = require('../models/User');
const Business = require('../models/Business');
const { Post, InvitePost } = require('../models/Post');
const { buildMediaFromPhotos } = require('../utils/posts/buildMediaFromPhotos');
const { hydratePostForResponse } = require('../utils/posts/hydrateAndEnrichForResponse');

dayjs.extend(utc);
dayjs.extend(timezone);

const DISPLAY_TZ = 'America/Chicago';

const fmtWhen = (isoOrDate, tz = DISPLAY_TZ) => {
  if (!isoOrDate) return '';
  const iso = isoOrDate instanceof Date ? isoOrDate.toISOString() : isoOrDate;
  return dayjs.utc(iso).tz(tz).format('MMMM D [at] h:mm A');
};

const ensureInviteDetails = (post) => {
  if (!post.details) post.details = {};
  if (!Array.isArray(post.details.recipients)) post.details.recipients = [];
  if (!Array.isArray(post.details.requests)) post.details.requests = [];

  // ✅ schema uses timeZone (camel-case Z)
  const tz =
    (typeof post.details.timeZone === 'string' && post.details.timeZone.trim())
      ? post.details.timeZone.trim()
      : (typeof post.details.timezone === 'string' && post.details.timezone.trim())
        ? post.details.timezone.trim()
        : DISPLAY_TZ;

  post.details.timeZone = tz;
  delete post.details.timezone;

  if (typeof post.details.recapReminderSentAt === 'undefined') {
    post.details.recapReminderSentAt = null;
  }

  return post.details;
};

/**
 * Normalize client input into VenueSchema shape:
 * - Place venue: { kind:'place', label, placeId, geo }
 * - Custom venue: { kind:'custom', label, geo? }
 *
 * Accepts either:
 * - req.body.venue (preferred)
 * - legacy: placeId/businessName/location
 */
function normalizeVenueInput(body) {
  const v = body?.venue;

  // Preferred: explicit venue object
  if (v && typeof v === 'object') {
    const kind = String(v.kind || '').trim();

    if (kind === 'place') {
      const label = String(v.label || body.businessName || '').trim();
      const placeId = String(v.placeId || body.placeId || '').trim();
      const address = String(v.address || body.address || '').trim();
      if (!label) return { error: 'venue.kind="place" requires label' };
      if (!placeId) return { error: 'venue.kind="place" requires placeId' };

      return {
        venueKind: 'place',
        venue: {
          kind: 'place',
          label,
          placeId,
          address,
          geo: v.geo || body.location || undefined,
        },
      };
    }

    if (kind === 'custom') {
      const label = String(v.label || '').trim();
      if (!label) return { error: 'venue.kind="custom" requires label' };

      return {
        venueKind: 'custom',
        venue: {
          kind: 'custom',
          label,
          placeId: null,
          address: v.address != null ? String(v.address).trim() : null,
          geo: v.geo || undefined,
        },
      };
    }

    return { error: 'venue.kind must be "place" or "custom"' };
  }

  // ✅ Legacy fallback (Google place only)
  if (typeof body?.placeId === 'string' && body.placeId.trim()) {
    const placeId = body.placeId.trim();
    const label = String(body.businessName || '').trim() || 'Place';

    return {
      venueKind: 'place',
      venue: {
        kind: 'place',
        label,
        placeId,
        address: null,
        geo: body.location || undefined,
      },
    };
  }

  // No legacy custom support
  return { error: 'Missing venue. Provide venue OR placeId for Google Places.' };
}

/**
 * For Google places only: ensure a Business exists (your current app still relies on it).
 * For custom venues: never create Business.
 */
async function ensureBusinessForPlaceVenue(placeId, label, geo) {
  if (!placeId) return null;

  let business = await Business.findOne({ placeId }).lean();
  if (business) return business;

  const coords = Array.isArray(geo?.coordinates) ? geo.coordinates : [0, 0];

  const created = await Business.create({
    placeId,
    businessName: label || 'Unknown Business',
    location: {
      type: 'Point',
      coordinates: coords,
      formattedAddress: geo?.formattedAddress || 'Unknown Address',
    },
    firstName: 'N/A',
    lastName: 'N/A',
    email: 'N/A',
    password: 'N/A',
    events: [],
    reviews: [],
  });

  return created.toObject();
}

function getVenueLabel(post, business) {
  return (
    post?.venue?.label ||
    business?.businessName ||
    post?.businessName ||
    'a place'
  );
}

/* --------------------------- /send --------------------------- */

router.post('/send', async (req, res) => {
  const {
    senderId,
    recipientIds = [],
    dateTime,
    message,
    note,
    isPublic,
    photos,
    timezone, // client input
  } = req.body;

  try {
    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    const venueResult = normalizeVenueInput(req.body);
    if (venueResult.error) return res.status(400).json({ error: venueResult.error });

    const { venue: normalizedVenue, venueKind } = venueResult;

    // Only for Google places
    let business = null;
    if (venueKind === 'place') {
      business = await Business.findOne({ placeId: normalizedVenue.placeId }).lean();
      if (!business) {
        const created = await Business.create({
          placeId: normalizedVenue.placeId,
          businessName: normalizedVenue.label || 'Unknown Business',
          location: normalizedVenue.geo || {
            type: 'Point',
            coordinates: [0, 0],
            formattedAddress: 'Unknown Address',
          },
          firstName: 'N/A',
          lastName: 'N/A',
          email: 'N/A',
          password: 'N/A',
          events: [],
          reviews: [],
        });
        business = created.toObject();
      }
    }

    const createdAt = new Date();
    const when = dateTime ? new Date(dateTime) : new Date();
    const text = message ?? note ?? '';

    // Custom venues must not be discoverable
    const privacy =
      venueKind === 'custom'
        ? 'private'
        : (isPublic ? 'public' : 'followers');

    const eventTimeZone =
      (typeof timezone === 'string' && timezone.trim())
        ? timezone.trim()
        : DISPLAY_TZ;

    const MAX_INVITE_PHOTOS = 6;
    const safePhotos = Array.isArray(photos) ? photos.slice(0, MAX_INVITE_PHOTOS) : [];
    const media = await buildMediaFromPhotos(safePhotos, senderId);

    const post = await InvitePost.create({
      ownerId: senderId,
      ownerModel: 'User',
      type: 'invite',
      message: text,
      privacy,
      venue: normalizedVenue, // ✅ required now
      media,
      details: {
        dateTime: when,
        timeZone: eventTimeZone, // ✅ schema key
        recipients: recipientIds.map((id) => ({ userId: id, status: 'pending' })),
        requests: [],
        recapReminderSentAt: null,
      },
      sortDate: createdAt,
    });

    const placeLabel = normalizedVenue.label || business?.businessName || 'a place';
    const formattedDateTime = fmtWhen(when.toISOString(), eventTimeZone);

    const baseNotif = {
      type: 'activityInvite',
      message: `${sender.firstName} invited you to ${placeLabel} on ${formattedDateTime}`,
      relatedId: sender._id,
      targetId: post._id,
      typeRef: 'User',
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    await Promise.all([
      ...recipientIds.map((uid) =>
        User.findByIdAndUpdate(uid, {
          $addToSet: { activityInvites: post._id },
          $push: { notifications: baseNotif },
        })
      ),
      User.findByIdAndUpdate(senderId, { $addToSet: { activityInvites: post._id } }),
    ]);

    const raw = post.toObject ? post.toObject() : post;
    const invite = await hydratePostForResponse(raw, { viewerId: senderId });
    return res.status(200).json({ success: true, message: 'Invite sent!', invite });
  } catch (err) {
    console.error('❌ Failed to send invite:', err);
    return res.status(500).json({ error: 'Failed to send invite', details: err.message });
  }
});

/* --------------------------- /accept --------------------------- */

router.post('/accept', async (req, res) => {
  const { recipientId, inviteId } = req.body;

  try {
    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const details = ensureInviteDetails(post);

    const row = (details.recipients || []).find((r) => String(r.userId) === String(recipientId));
    if (row) row.status = 'accepted';

    await post.save();

    // Remove original invite + reminder notifications for THIS invite
    recipient.notifications = (recipient.notifications || []).filter(
      (n) =>
        !(
          (n.type === 'activityInvite' || n.type === 'activityInviteReminder') &&
          String(n.relatedId) === String(post.ownerId) &&
          String(n.targetId) === String(post._id) &&
          n.postType === 'invite'
        )
    );
    await recipient.save();

    const business = post.placeId ? await Business.findOne({ placeId: post.placeId }).lean() : null;
    const tz = details.timeZone || DISPLAY_TZ;
    const formattedDate = fmtWhen(details.dateTime, tz);
    const acceptedCount = (details.recipients || []).filter((r) => r.status === 'accepted').length;

    const placeLabel = getVenueLabel(post, business);

    const senderNotification = {
      type: 'activityInviteAccepted',
      message: `🎉 Your activity invite for ${placeLabel} now has ${acceptedCount} accepted.`,
      relatedId: recipient._id,
      typeRef: 'User',
      targetId: post._id,
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    const recipientConfirmation = {
      type: 'activityInviteAccepted',
      message: `You accepted the invite to ${placeLabel} on ${formattedDate}`,
      relatedId: post._id,
      typeRef: 'Post',
      targetId: post._id,
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    await Promise.all([
      User.findByIdAndUpdate(post.ownerId, { $push: { notifications: senderNotification } }),
      User.findByIdAndUpdate(recipientId, { $push: { notifications: recipientConfirmation } }),
    ]);

    // Only notify a Business for real Google place venues
    if (acceptedCount >= 5 && business?._id && post?.venue?.kind === 'place') {
      await Business.findByIdAndUpdate(business._id, {
        $push: {
          notifications: {
            type: 'activityInvite',
            message: `🎉 A group event at your business (${placeLabel}) just reached ${acceptedCount} attendees!`,
            relatedId: post._id,
            typeRef: 'Post',
            targetId: post._id,
            targetRef: 'Post',
            postType: 'invite',
            createdAt: new Date(),
          },
        },
      });
    }

    const raw = post.toObject ? post.toObject() : post;
    const invite = await hydratePostForResponse(raw, { viewerId: recipientId });
    return res.status(200).json({ success: true, message: 'Invite accepted!', invite });
  } catch (err) {
    console.error('❌ Error in /accept:', err);
    return res.status(500).json({ error: 'Failed to accept invite', details: err.message });
  }
});

/* --------------------------- /reject --------------------------- */

router.post('/reject', async (req, res) => {
  const { recipientId, inviteId } = req.body;

  try {
    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const details = ensureInviteDetails(post);

    const row = (details.recipients || []).find((r) => String(r.userId) === String(recipientId));
    if (row) row.status = 'declined';

    await post.save();

    // Remove original invite + reminder notifications for THIS invite
    recipient.notifications = (recipient.notifications || []).filter(
      (n) =>
        !(
          (n.type === 'activityInvite' || n.type === 'activityInviteReminder') &&
          String(n.relatedId) === String(post.ownerId) &&
          String(n.targetId) === String(post._id) &&
          n.postType === 'invite'
        )
    );
    await recipient.save();

    const business = post.placeId ? await Business.findOne({ placeId: post.placeId }).lean() : null;
    const tz = details.timeZone || DISPLAY_TZ;
    const formattedDate = fmtWhen(details.dateTime, tz);
    const placeLabel = getVenueLabel(post, business);

    const senderNotification = {
      type: 'activityInviteDeclined',
      message: `${recipient.firstName} declined your activity invite to ${placeLabel} on ${formattedDate}`,
      relatedId: recipient._id,
      typeRef: 'User',
      targetId: post._id,
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    const recipientConfirmation = {
      type: 'activityInviteDeclined',
      message: `You declined the invite to ${placeLabel} on ${formattedDate}`,
      relatedId: post._id,
      typeRef: 'Post',
      targetId: post._id,
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    await Promise.all([
      User.findByIdAndUpdate(post.ownerId, { $push: { notifications: senderNotification } }),
      User.findByIdAndUpdate(recipientId, { $push: { notifications: recipientConfirmation } }),
    ]);

    const raw = post.toObject ? post.toObject() : post;
    const invite = await hydratePostForResponse(raw, { viewerId: recipientId });
    return res.status(200).json({ success: true, message: 'Invite declined', invite });
  } catch (err) {
    console.error('❌ Error in /reject:', err);
    return res.status(500).json({ error: 'Failed to decline invite', details: err.message });
  }
});

/* --------------------------- /edit --------------------------- */

router.put('/edit', async (req, res) => {
  const senderId = req.body.senderId || req.body.recipientId;
  const { inviteId, updates = {}, recipientIds = [] } = req.body;

  try {
    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    if (!senderId) return res.status(400).json({ error: 'Missing senderId' });

    if (String(post.ownerId) !== String(senderId)) {
      return res.status(400).json({ error: 'Only the sender can edit this invite' });
    }

    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    // ---- media (optional) ----
    const MAX_INVITE_PHOTOS = 6;
    if (updates.photos !== undefined) {
      const nextPhotos = Array.isArray(updates.photos)
        ? updates.photos.slice(0, MAX_INVITE_PHOTOS)
        : [];
      post.media = await buildMediaFromPhotos(nextPhotos, senderId);
    }

    // ---- details defaults + timezone fix (timeZone) ----
    const details = ensureInviteDetails(post);

    // ---- recipients merge (preserve status/nudgedAt for existing) ----
    const prevRecipients = Array.isArray(details.recipients) ? details.recipients : [];
    const prevRequests = Array.isArray(details.requests) ? details.requests : [];

    const prevById = new Map(
      prevRecipients.map((r) => [
        String(r.userId),
        { userId: r.userId, status: r.status, nudgedAt: r.nudgedAt || null },
      ])
    );

    const nextIds = (Array.isArray(recipientIds) ? recipientIds : []).map(String);
    const nextSet = new Set(nextIds);
    const prevSet = new Set(prevRecipients.map((r) => String(r.userId)));

    const mergedRecipients = nextIds.map((id) => {
      const prev = prevById.get(id);
      return prev
        ? { userId: prev.userId, status: prev.status, nudgedAt: prev.nudgedAt }
        : { userId: id, status: 'pending', nudgedAt: null };
    });

    // ---- core post fields ----
    if (updates.message !== undefined) {
      post.message = updates.message ?? '';
    }

    // ---- venue updates (preferred: updates.venue) ----
    // Legacy invites are Google Places, so legacy fallback is "placeId => place venue".
    if (updates.venue || updates.placeId || updates.businessName || updates.location) {
      const venueResult = normalizeVenueInput({
        venue: updates.venue || null,
        placeId: updates.placeId || null,
        businessName: updates.businessName || null,
        location: updates.location || null,
      });

      if (venueResult.error) {
        return res.status(400).json({ error: venueResult.error });
      }

      post.venue = venueResult.venue;

      // If switched to custom, force private (schema also enforces, but do it here)
      if (venueResult.venueKind === 'custom') {
        post.privacy = 'private';
      }
    }

    // Optional: allow changing public/followers only for place venues
    if (typeof updates.isPublic === 'boolean') {
      if (post.venue?.kind === 'custom') {
        post.privacy = 'private';
      } else {
        post.privacy = updates.isPublic ? 'public' : 'followers';
      }
    }

    // ---- date/time updates ----
    if (updates.dateTime !== undefined) {
      const newWhen = updates.dateTime ? new Date(updates.dateTime) : null;
      if (newWhen) details.dateTime = newWhen;
    }

    // ✅ schema uses timeZone (camel-case Z); tolerate legacy "timezone"
    if (typeof updates.timeZone === 'string' && updates.timeZone.trim()) {
      details.timeZone = updates.timeZone.trim();
    } else if (typeof updates.timezone === 'string' && updates.timezone.trim()) {
      details.timeZone = updates.timezone.trim();
    }

    // ---- invite-specific arrays ----
    details.recipients = mergedRecipients;

    // Remove any "requests" that belong to users no longer in recipients
    details.requests = prevRequests.filter((r) => nextSet.has(String(r.userId)));

    post.details = details;

    await post.save();

    // ---- notification message text ----
    const tz = details.timeZone || DISPLAY_TZ;
    const formattedDateTime = fmtWhen(details.dateTime, tz);

    // Prefer venue label. Business is only meaningful for "place" venues.
    let business = null;
    if (post.venue?.kind === 'place' && post.venue?.placeId) {
      business = await Business.findOne({ placeId: post.venue.placeId }).lean();
    }

    const placeLabel =
      post.venue?.label ||
      business?.businessName ||
      'a place';

    const updatedMessage = `${sender.firstName} invited you to ${placeLabel} on ${formattedDateTime}`;

    // ---- upsert/update recipient notifications (scoped to THIS invite) ----
    await Promise.all(
      nextIds.map(async (uid) => {
        const user = await User.findById(uid);
        if (!user) return;

        if (!Array.isArray(user.activityInvites)) user.activityInvites = [];
        if (!user.activityInvites.some((id) => String(id) === String(inviteId))) {
          user.activityInvites.push(post._id);
        }

        if (!Array.isArray(user.notifications)) user.notifications = [];

        // Update whichever exists for this invite (invite or reminder), but DO NOT match "any invite from sender".
        const existing = user.notifications.find(
          (n) =>
            String(n.targetId) === String(post._id) &&
            n.postType === 'invite' &&
            (n.type === 'activityInvite' || n.type === 'activityInviteReminder') &&
            String(n.relatedId) === String(sender._id)
        );

        if (existing) {
          existing.message = updatedMessage;
          existing.createdAt = new Date();
        } else {
          user.notifications.push({
            type: 'activityInvite',
            message: updatedMessage,
            relatedId: sender._id,
            typeRef: 'User',
            targetId: post._id,
            targetRef: 'Post',
            postType: 'invite',
            createdAt: new Date(),
          });
        }

        await user.save();
      })
    );

    // ---- remove notifications + activityInvites from removed recipients ----
    const removedIds = [...prevSet].filter((id) => !nextSet.has(id));

    await Promise.all(
      removedIds.map((rid) =>
        User.findByIdAndUpdate(rid, {
          $pull: {
            activityInvites: post._id,
            notifications: {
              targetId: post._id,
              postType: 'invite',
              type: { $in: ['activityInvite', 'activityInviteReminder'] },
            },
          },
        })
      )
    );

    const raw = post.toObject ? post.toObject() : post;
    const invite = await hydratePostForResponse(raw, { viewerId: senderId });

    return res.status(200).json({
      success: true,
      message: 'Invite updated',
      updatedInvite: invite,
    });
  } catch (err) {
    console.error('❌ Error editing invite:', err);
    return res.status(500).json({ error: 'Failed to edit invite', details: err.message });
  }
});

/* --------------------------- /delete --------------------------- */

router.delete('/delete', async (req, res) => {
  const { senderId, inviteId } = req.body;

  try {
    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    if (String(post.ownerId) !== String(senderId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const details = ensureInviteDetails(post);
    const recipientIds = [
      ...(details.recipients || []).map((r) => r.userId),
      ...(details.requests || []).map((r) => r.userId),
    ].map(String);

    await Post.deleteOne({ _id: inviteId });

    const allIds = [String(senderId), ...recipientIds];
    await Promise.all(
      allIds.map((uid) =>
        User.findByIdAndUpdate(uid, {
          $pull: {
            activityInvites: post._id,
            notifications: { targetId: post._id },
          },
        })
      )
    );

    return res.status(200).json({
      success: true,
      message: 'Invite and related notifications removed.',
    });
  } catch (err) {
    console.error('❌ Error deleting invite:', err);
    return res.status(500).json({ error: 'Failed to delete invite', details: err.message });
  }
});

/* --------------------------- /request --------------------------- */

router.post('/request', async (req, res) => {
  const { userId, inviteId } = req.body;

  try {
    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const details = ensureInviteDetails(post);

    const alreadyRequested = (details.requests || []).some((r) => String(r.userId) === String(userId));
    const alreadyInvited = (details.recipients || []).some((r) => String(r.userId) === String(userId));
    if (alreadyRequested || alreadyInvited) {
      return res.status(400).json({ error: 'You have already requested or been invited' });
    }

    details.requests.push({ userId, status: 'pending' });
    post.details = details;
    await post.save();

    const raw = post.toObject ? post.toObject() : post;
    const invite = await hydratePostForResponse(raw, { viewerId: userId });
    return res.status(200).json({ success: true, message: 'Request sent!', invite });
  } catch (err) {
    console.error('❌ Failed to request invite:', err);
    return res.status(500).json({ error: 'Failed to request invite', details: err.message });
  }
});

/* --------------------- /accept-user-request --------------------- */

router.post('/accept-user-request', async (req, res) => {
  const { inviteId, userId } = req.body;

  try {
    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const details = ensureInviteDetails(post);

    const idx = (details.requests || []).findIndex((r) => String(r.userId) === String(userId));
    if (idx === -1) return res.status(400).json({ error: 'Request not found' });

    details.requests.splice(idx, 1);
    details.recipients.push({ userId, status: 'accepted' });
    post.details = details;

    await post.save();

    await User.updateOne({ _id: userId }, { $addToSet: { activityInvites: post._id } });

    await User.updateOne(
      { _id: post.ownerId },
      {
        $pull: {
          notifications: {
            type: 'requestInvite',
            relatedId: userId,
            targetId: inviteId,
            targetRef: 'Post',
            typeRef: 'User',
          },
        },
      }
    );

    const raw = post.toObject ? post.toObject() : post;
    const invite = await hydratePostForResponse(raw, { viewerId: String(post.ownerId) });
    return res.status(200).json({ success: true, message: 'Request accepted', invite });
  } catch (err) {
    console.error('❌ Failed to accept request:', err);
    return res.status(500).json({ error: 'Failed to accept request', details: err.message });
  }
});

/* --------------------- /reject-user-request --------------------- */

router.post('/reject-user-request', async (req, res) => {
  const { inviteId, userId } = req.body;

  try {
    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const details = ensureInviteDetails(post);
    const before = (details.requests || []).length;

    details.requests = (details.requests || []).filter((r) => String(r.userId) !== String(userId));
    post.details = details;

    if ((details.requests || []).length === before) {
      return res.status(400).json({ error: 'Request not found' });
    }

    await post.save();

    await User.updateOne(
      { _id: post.ownerId },
      {
        $pull: {
          notifications: {
            type: 'requestInvite',
            relatedId: userId,
            targetId: inviteId,
            targetRef: 'Post',
          },
        },
      }
    );

    const raw = post.toObject ? post.toObject() : post;
    const invite = await hydratePostForResponse(raw, { viewerId: String(post.ownerId) });
    return res.status(200).json({ success: true, message: 'Invite rejected', invite });
  } catch (err) {
    console.error('❌ Failed to reject request:', err);
    return res.status(500).json({ error: 'Failed to reject request', details: err.message });
  }
});

/* --------------------------- /nudge --------------------------- */

router.post('/nudge', async (req, res) => {
  const { senderId, recipientId, inviteId } = req.body;

  try {
    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    if (String(post.ownerId) !== String(senderId)) {
      return res.status(400).json({ error: 'Only the sender can nudge recipients' });
    }

    const details = ensureInviteDetails(post);

    const row = (details.recipients || []).find((r) => String(r.userId) === String(recipientId));
    if (!row) return res.status(404).json({ error: 'Recipient not found on this invite' });

    if (row.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending recipients can be nudged' });
    }

    if (row.nudgedAt) {
      return res.status(400).json({ error: 'Recipient has already been nudged for this invite' });
    }

    row.nudgedAt = new Date();
    await post.save();

    const business = post.placeId ? await Business.findOne({ placeId: post.placeId }).lean() : null;
    const tz = details.timeZone || DISPLAY_TZ;
    const formattedDateTime = fmtWhen(details.dateTime, tz);
    const placeLabel = getVenueLabel(post, business);

    const nudgeMessage = `${sender.firstName} sent you a reminder about ${placeLabel} on ${formattedDateTime}`;

    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ error: 'Recipient user not found' });

    if (!Array.isArray(recipient.activityInvites)) recipient.activityInvites = [];
    if (!recipient.activityInvites.some((id) => String(id) === String(post._id))) {
      recipient.activityInvites.push(post._id);
    }

    if (!Array.isArray(recipient.notifications)) recipient.notifications = [];

    const idx = recipient.notifications.findIndex(
      (n) =>
        String(n.targetId) === String(post._id) &&
        n.postType === 'invite' &&
        (n.type === 'activityInvite' || n.type === 'activityInviteReminder')
    );

    if (idx >= 0) {
      const existing = recipient.notifications[idx];
      existing.type = 'activityInviteReminder';
      existing.message = nudgeMessage;
      existing.relatedId = sender._id;
      existing.typeRef = 'User';
      existing.targetRef = 'Post';
      existing.postType = 'invite';
      existing.createdAt = new Date();
    } else {
      recipient.notifications.push({
        type: 'activityInviteReminder',
        message: nudgeMessage,
        relatedId: sender._id,
        typeRef: 'User',
        targetId: post._id,
        targetRef: 'Post',
        postType: 'invite',
        createdAt: new Date(),
      });
    }

    await recipient.save();

    const raw = post.toObject ? post.toObject() : post;
    const invite = await hydratePostForResponse(raw, { viewerId: senderId });
    return res.status(200).json({ success: true, message: 'Recipient nudged', invite });
  } catch (err) {
    console.error('❌ Error in /nudge:', err);
    return res.status(500).json({ error: 'Failed to nudge recipient', details: err.message });
  }
});

module.exports = router;
