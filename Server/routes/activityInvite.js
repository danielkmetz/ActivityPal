const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

const User = require('../models/User');
const Business = require('../models/Business');
const { Post, InvitePost } = require('../models/Post');   // ⬅️ use InvitePost
const { getPresignedUrl } = require('../utils/cachePresignedUrl');

dayjs.extend(utc);
dayjs.extend(timezone);

const DISPLAY_TZ = 'America/Chicago';

const fmtWhen = (iso, tz = DISPLAY_TZ) =>
  iso ? dayjs.utc(iso).tz(tz).format('MMMM D [at] h:mm A') : '';

const ensureInviteDetails = (post) => {
  if (!post.details) post.details = {};
  if (!Array.isArray(post.details.recipients)) post.details.recipients = [];
  if (!Array.isArray(post.details.requests)) post.details.requests = [];

  // default timezone on the invite if missing
  if (typeof post.details.timezone !== 'string' || !post.details.timezone.trim()) {
    post.details.timezone = DISPLAY_TZ;
  }

  // recap worker will set this when it fires
  if (typeof post.details.recapReminderSentAt === 'undefined') {
    post.details.recapReminderSentAt = null;
  }

  return post.details;
};

/* -------------------------- small helpers -------------------------- */

const toId = (x) => String(x?._id ?? x?.id ?? x ?? '');

async function presignProfilePic(user) {
  const key = user?.profilePic?.photoKey;
  return key ? await getPresignedUrl(key) : null;
}

async function loadUsersMap(userIds = []) {
  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return new Map();

  const users = await User.find({ _id: { $in: ids } })
    .select('_id firstName lastName profilePic')
    .lean();

  const entries = await Promise.all(
    users.map(async (u) => {
      const url = await presignProfilePic(u);
      return [
        String(u._id),
        {
          id: String(u._id),
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          profilePicUrl: url,
        },
      ];
    })
  );

  return new Map(entries);
}

function mapRecipient(r, usersMap) {
  const u = usersMap.get(String(r.userId));
  return {
    userId: String(r.userId),
    status: r.status || 'pending',
    firstName: u?.firstName || '',
    lastName: u?.lastName || '',
    profilePicUrl: u?.profilePicUrl || null,
  };
}

function mapRequest(r, usersMap) {
  const u = usersMap.get(String(r.userId));
  return {
    _id: r?._id ? String(r._id) : undefined,
    userId: String(r.userId),
    status: r?.status || 'pending',
    firstName: u?.firstName || '',
    lastName: u?.lastName || '',
    profilePicUrl: u?.profilePicUrl || null,
  };
}

/**
 * Serialize a Post (type: 'invite') into the GraphQL Post shape.
 */
async function serializeInvitePost(postDoc) {
  const post = postDoc.toObject ? postDoc.toObject() : postDoc;
  const details = post.details || {};

  // --- Business snapshot ---
  let businessName = post.businessName || null;
  let businessLogoUrl = post.businessLogoUrl || null;
  let business = null;

  if (post.placeId) {
    business = await Business.findOne({ placeId: post.placeId }).lean();
    if (business) {
      if (!businessName) {
        businessName = business.businessName || 'Unknown Business';
      }
      if (business.logoKey && !businessLogoUrl) {
        businessLogoUrl = await getPresignedUrl(business.logoKey);
      }
    }
  }

  // --- Resolve all users involved (owner + recipients + requests) ---
  const ownerId = post.ownerId ? String(post.ownerId) : null;
  const allUserIds = [
    ownerId,
    ...(details.recipients || []).map((r) => r.userId),
    ...(details.requests || []).map((r) => r.userId),
  ].filter(Boolean);

  const usersMap = await loadUsersMap(allUserIds);

  // Owner = sender (User)
  const senderUser = ownerId ? usersMap.get(ownerId) : null;
  const owner =
    senderUser && ownerId
      ? {
        __typename: 'User',
        id: ownerId,
        firstName: senderUser.firstName || '',
        lastName: senderUser.lastName || '',
        fullName: `${senderUser.firstName || ''} ${senderUser.lastName || ''}`.trim(),
        profilePicUrl: senderUser.profilePicUrl || null,
      }
      : null;

  // --- InviteDetails.recipients ---
  const recipients = (details.recipients || []).map((r) => {
    const u = usersMap.get(String(r.userId));
    return {
      __typename: 'InviteRecipient',
      status: r.status || 'pending',
      nudgedAt: r.nudgedAt || null,
      user: {
        __typename: 'InviteUser',
        id: String(r.userId),
        firstName: u?.firstName || '',
        lastName: u?.lastName || '',
        profilePicUrl: u?.profilePicUrl || null,
      },
    };
  });

  // --- InviteDetails.requests ---
  const requests = (details.requests || []).map((r) => mapRequest(r, usersMap));

  // --- Likes / comments / stats ---
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const comments = Array.isArray(post.comments) ? post.comments : [];

  const nowIso = new Date().toISOString();
  const createdAtIso = post.createdAt ? String(post.createdAt) : nowIso;
  const updatedAtIso = post.updatedAt ? String(post.updatedAt) : createdAtIso;

  return {
    __typename: 'Post',
    _id: String(post._id),
    type: 'invite',

    owner,
    ownerId,
    ownerModel: 'User',

    message: post.message || null,
    placeId: post.placeId ? String(post.placeId) : null,
    location: post.location || null,
    media: post.media || [],
    taggedUsers: post.taggedUsers || [],

    likes,
    comments,
    stats: {
      likeCount: likes.length,
      commentCount: comments.length,
      shareCount: post.stats?.shareCount ?? 0,
    },

    privacy: post.privacy || 'public',
    visibility: post.visibility || 'visible',
    sortDate: post.sortDate || post.createdAt || post.date || nowIso,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,

    details: {
      __typename: 'InviteDetails',
      dateTime: details.dateTime || null,
      recipients,
      requests,
    },

    shared: post.shared || null,
    refs: post.refs || null,

    businessName,
    businessLogoUrl,
    original: null,
  };
}

/* ------------------------ core invariants ------------------------- */

function computeInviteStatus(recipients = []) {
  const allAccepted = recipients.length > 0 && recipients.every((r) => r.status === 'accepted');
  const anyDeclined = recipients.some((r) => r.status === 'declined');
  const anyPending = recipients.some((r) => r.status === 'pending');

  if (allAccepted) return 'accepted';
  if (anyDeclined && !anyPending) return 'declined';
  return 'pending';
}

/* --------------------------- /send --------------------------- */

router.post('/send', async (req, res) => {
  const {
    senderId,
    recipientIds = [],
    placeId,
    dateTime,
    message,
    isPublic,
    note,
    businessName,
    location,
    timezone,           // 👈 from client (event timezone)
  } = req.body;

  try {
    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    // Ensure business exists (unchanged)
    let business = await Business.findOne({ placeId }).lean();
    if (!business) {
      const created = await Business.create({
        placeId,
        businessName: businessName || 'Unknown Business',
        location: {
          type: 'Point',
          coordinates: [0, 0],
          formattedAddress: location?.formattedAddress || 'Unknown Address',
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

    const createdAt = new Date();
    const when = dateTime ? new Date(dateTime) : new Date();
    const text = message ?? note ?? '';
    const privacy = isPublic ? 'public' : 'followers';

    const eventTimezone = (typeof timezone === 'string' && timezone.trim())
      ? timezone.trim()
      : DISPLAY_TZ;

    const post = await InvitePost.create({
      ownerId: senderId,
      ownerModel: 'User',
      type: 'invite',
      message: text,
      placeId,
      businessName: business.businessName,
      location: business.location || location,
      privacy,
      details: {
        dateTime: when,
        timezone: eventTimezone,           // 👈 store event tz
        recipients: recipientIds.map((id) => ({ userId: id, status: 'pending' })),
        requests: [],
        recapReminderSentAt: null,        // 👈 worker will set later
      },
      sortDate: createdAt,
    });

    // Notifications (use event timezone for messaging)
    const formattedDateTime = fmtWhen(when.toISOString(), eventTimezone);
    const baseNotif = {
      type: 'activityInvite',
      message: `${sender.firstName} invited you to ${business.businessName} on ${formattedDateTime}`,
      relatedId: sender._id,
      targetId: post._id,
      typeRef: 'User',
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    const recipientOps = recipientIds.map((uid) =>
      User.findByIdAndUpdate(uid, {
        $addToSet: { activityInvites: post._id },
        $push: { notifications: baseNotif },
      })
    );

    const senderOp = User.findByIdAndUpdate(senderId, {
      $addToSet: { activityInvites: post._id },
    });

    await Promise.all([...recipientOps, senderOp]);

    const out = await serializeInvitePost(post);
    return res.status(200).json({ success: true, message: 'Invite sent!', invite: out });
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

    const row = (details.recipients || []).find(
      (r) => String(r.userId) === String(recipientId)
    );
    if (row) row.status = 'accepted';

    await post.save();

    // Remove original invite *and reminder* notifications for THIS invite
    recipient.notifications = (recipient.notifications || []).filter(
      (n) =>
        !(
          (n.type === 'activityInvite' ||
            n.type === 'activityInviteReminder') &&           // 👈 include reminder
          String(n.relatedId) === String(post.ownerId) &&
          String(n.targetId) === String(post._id) &&
          n.postType === 'invite'
        )
    );
    await recipient.save();

    const business = await Business.findOne({ placeId: post.placeId }).lean();
    const tz = details.timezone || DISPLAY_TZ;
    const formattedDate = fmtWhen(details.dateTime, tz);
    const acceptedCount = (details.recipients || []).filter(
      (r) => r.status === 'accepted'
    ).length;

    const senderNotification = {
      type: 'activityInviteAccepted',
      message: business
        ? `🎉 Your activity invite for ${business.businessName} now has ${acceptedCount} accepted.`
        : `🎉 Your activity invite now has ${acceptedCount} accepted.`,
      relatedId: recipient._id,
      typeRef: 'User',
      targetId: post._id,
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    const recipientConfirmation = {
      type: 'activityInviteAccepted',
      message: business
        ? `You accepted the invite to ${business.businessName} on ${formattedDate}`
        : `You accepted the invite on ${formattedDate}`,
      relatedId: post._id,
      typeRef: 'Post',
      targetId: post._id,
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    await Promise.all([
      User.findByIdAndUpdate(post.ownerId, {
        $push: { notifications: senderNotification },
      }),
      User.findByIdAndUpdate(recipientId, {
        $push: { notifications: recipientConfirmation },
      }),
    ]);

    if (acceptedCount >= 5 && business?._id) {
      await Business.findByIdAndUpdate(business._id, {
        $push: {
          notifications: {
            type: 'activityInvite',
            message: `🎉 A group event at your business (${business.businessName}) just reached ${acceptedCount} attendees!`,
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

    const out = await serializeInvitePost(post);
    return res
      .status(200)
      .json({ success: true, message: 'Invite accepted!', invite: out });
  } catch (err) {
    console.error('❌ Error in /accept:', err);
    return res
      .status(500)
      .json({ error: 'Failed to accept invite', details: err.message });
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
    const row = (details.recipients || []).find(
      (r) => String(r.userId) === String(recipientId)
    );
    if (row) row.status = 'declined';

    await post.save();

    // Remove original invite *and reminder* notifications for THIS invite
    recipient.notifications = (recipient.notifications || []).filter(
      (n) =>
        !(
          (n.type === 'activityInvite' ||
            n.type === 'activityInviteReminder') &&           // 👈 include reminder
          String(n.relatedId) === String(post.ownerId) &&
          String(n.targetId) === String(post._id) &&
          n.postType === 'invite'
        )
    );
    await recipient.save();

    const business = await Business.findOne({ placeId: post.placeId }).lean();
    const tz = details.timezone || DISPLAY_TZ;
    const formattedDate = fmtWhen(details.dateTime, tz);

    const senderNotification = {
      type: 'activityInviteDeclined',
      message: business
        ? `${recipient.firstName} declined your activity invite to ${business.businessName} on ${formattedDate}`
        : `${recipient.firstName} declined your activity invite on ${formattedDate}`,
      relatedId: recipient._id,
      typeRef: 'User',
      targetId: post._id,
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    const recipientConfirmation = {
      type: 'activityInviteDeclined',
      message: business
        ? `You declined the invite to ${business.businessName} on ${formattedDate}`
        : `You declined the invite on ${formattedDate}`,
      relatedId: post._id,
      typeRef: 'Post',
      targetId: post._id,
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    await Promise.all([
      User.findByIdAndUpdate(post.ownerId, {
        $push: { notifications: senderNotification },
      }),
      User.findByIdAndUpdate(recipientId, {
        $push: { notifications: recipientConfirmation },
      }),
    ]);

    const out = await serializeInvitePost(post);
    return res.status(200).json({
      success: true,
      message: 'Invite declined, sender notified.',
      invite: out,
    });
  } catch (err) {
    console.error('❌ Error in /reject:', err);
    return res
      .status(500)
      .json({ error: 'Failed to decline invite', details: err.message });
  }
});

/* --------------------------- /edit --------------------------- */

router.put('/edit', async (req, res) => {
  const { recipientId: senderId, inviteId, updates = {}, recipientIds = [] } = req.body;

  try {
    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    if (String(post.ownerId) !== String(senderId)) {
      return res.status(400).json({ error: 'Only the sender can edit this invite' });
    }

    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    const details = ensureInviteDetails(post);

    const prevRecipients = Array.isArray(details.recipients) ? details.recipients : [];
    const prevRequests = Array.isArray(details.requests) ? details.requests : [];

    const prevById = new Map(
      prevRecipients.map((r) => [String(r.userId), { userId: r.userId, status: r.status }])
    );
    const nextIds = (recipientIds || []).map(String);
    const nextSet = new Set(nextIds);
    const prevSet = new Set(prevRecipients.map((r) => String(r.userId)));

    const mergedRecipients = nextIds.map((id) => {
      const prev = prevById.get(id);
      return prev ? { userId: prev.userId, status: prev.status } : { userId: id, status: 'pending' };
    });

    // Core post fields
    post.message = updates.message ?? post.message;
    post.placeId = updates.placeId ?? post.placeId;

    if (updates.dateTime !== undefined) {
      const newWhen = updates.dateTime ? new Date(updates.dateTime) : null;
      if (newWhen) {
        details.dateTime = newWhen;
      }
    }

    // NEW: allow timezone update if provided
    if (typeof updates.timezone === 'string' && updates.timezone.trim()) {
      details.timezone = updates.timezone.trim();
    }

    // Invite-specific
    details.recipients = mergedRecipients;
    details.requests = prevRequests.filter((r) => !nextSet.has(String(r.userId)));
    post.details = details;

    await post.save();

    const business = await Business.findOne({ placeId: post.placeId }).lean();
    const tz = details.timezone || DISPLAY_TZ;
    const formattedDateTime = fmtWhen(details.dateTime, tz);
    const updatedMessage = `${sender.firstName} invited you to ${
      business?.businessName || 'a place'
    } on ${formattedDateTime}`;

    // Upsert/update recipient notifications (unchanged except message uses tz now)
    await Promise.all(
      nextIds.map(async (uid) => {
        const user = await User.findById(uid);
        if (!user) return;

        if (!user.activityInvites?.some((id) => String(id) === String(inviteId))) {
          user.activityInvites = user.activityInvites || [];
          user.activityInvites.push(post._id);
        }

        const existing = (user.notifications || []).find(
          (n) =>
            n.type === 'activityInvite' &&
            String(n.relatedId) === String(sender._id) &&
            n.postType === 'invite'
        );

        if (existing) {
          existing.message = updatedMessage;
          existing.createdAt = new Date();
        } else {
          user.notifications = user.notifications || [];
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

    // Remove notifications from removed recipients (unchanged)
    const removedIds = [...prevSet].filter((id) => !nextSet.has(id));
    await Promise.all(
      removedIds.map((rid) =>
        User.findByIdAndUpdate(rid, {
          $pull: {
            activityInvites: post._id,
            notifications: {
              type: 'activityInvite',
              relatedId: sender._id,
              targetId: post._id,
              postType: 'invite',
            },
          },
        })
      )
    );

    const out = await serializeInvitePost(post);
    return res.status(200).json({ success: true, message: 'Invite updated', updatedInvite: out });
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

    const alreadyRequested = (details.requests || []).some(
      (r) => String(r.userId) === String(userId)
    );
    const alreadyInvited = (details.recipients || []).some(
      (r) => String(r.userId) === String(userId)
    );
    if (alreadyRequested || alreadyInvited) {
      return res.status(400).json({ error: 'You have already requested or been invited' });
    }

    details.requests.push({ userId, status: 'pending' });
    post.details = details;
    await post.save();

    const out = await serializeInvitePost(post);
    return res.status(200).json({ success: true, message: 'Request sent!', invite: out });
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

    const idx = (details.requests || []).findIndex(
      (r) => String(r.userId) === String(userId)
    );
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

    const out = await serializeInvitePost(post);
    return res.status(200).json({ success: true, message: 'Request accepted', invite: out });
  } catch (err) {
    console.error('❌ Failed to accept request:', err);
    return res.status(500).json({ error: 'Failed to accept request' });
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

    details.requests = (details.requests || []).filter(
      (r) => String(r.userId) !== String(userId)
    );
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

    const out = await serializeInvitePost(post);
    return res.status(200).json({ success: true, message: 'Request rejected', invite: out });
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
    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const post = await InvitePost.findOne({ _id: inviteId, type: 'invite' });
    if (!post) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    // Only the host/sender can nudge
    if (String(post.ownerId) !== String(senderId)) {
      return res
        .status(400)
        .json({ error: 'Only the sender can nudge recipients' });
    }

    const details = ensureInviteDetails(post);

    const row = (details.recipients || []).find(
      (r) => String(r.userId) === String(recipientId)
    );
    if (!row) {
      return res
        .status(404)
        .json({ error: 'Recipient not found on this invite' });
    }

    // Only pending recipients get nudged
    if (row.status !== 'pending') {
      return res
        .status(400)
        .json({ error: 'Only pending recipients can be nudged' });
    }

    // Enforce one-nudge-per-user-per-invite
    if (row.nudgedAt) {
      return res
        .status(400)
        .json({ error: 'Recipient has already been nudged for this invite' });
    }

    row.nudgedAt = new Date();
    await post.save();

    const business = await Business.findOne({ placeId: post.placeId }).lean();
    const tz = details.timezone || DISPLAY_TZ;
    const formattedDateTime = fmtWhen(details.dateTime, tz);

    const nudgeMessage = business
      ? `${sender.firstName} sent you a reminder about ${business.businessName} on ${formattedDateTime}`
      : `${sender.firstName} sent you a reminder about an invite on ${formattedDateTime}`;

    const nudgeNotification = {
      type: 'activityInviteReminder', // new notification type
      message: nudgeMessage,
      relatedId: sender._id,          // who nudged you
      typeRef: 'User',
      targetId: post._id,             // the invite
      targetRef: 'Post',
      postType: 'invite',
      createdAt: new Date(),
    };

    // 🔻 NEW: update existing notification instead of blindly pushing
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    // Make sure the invite is tracked on the user (previously $addToSet)
    if (!Array.isArray(recipient.activityInvites)) {
      recipient.activityInvites = [];
    }
    const alreadyHasInvite = recipient.activityInvites.some(
      (id) => String(id) === String(post._id)
    );
    if (!alreadyHasInvite) {
      recipient.activityInvites.push(post._id);
    }

    if (!Array.isArray(recipient.notifications)) {
      recipient.notifications = [];
    }

    // Find an existing invite notification to transform into a reminder
    const idx = recipient.notifications.findIndex(
      (n) =>
        String(n.targetId) === String(post._id) &&
        n.postType === 'invite' &&
        (n.type === 'activityInvite' ||
          n.type === 'activityInviteReminder')
    );

    if (idx >= 0) {
      // Update the existing notification in place -> becomes the reminder
      const existing = recipient.notifications[idx];
      existing.type = 'activityInviteReminder';
      existing.message = nudgeMessage;
      existing.relatedId = sender._id;
      existing.typeRef = 'User';
      existing.targetRef = 'Post';
      existing.postType = 'invite';
      existing.createdAt = new Date(); // bump to top if you sort by createdAt
    } else {
      // No existing invite notification? Fallback: push a new reminder notification
      recipient.notifications.push(nudgeNotification);
    }

    await recipient.save();

    const out = await serializeInvitePost(post);
    return res.status(200).json({
      success: true,
      message: 'Recipient nudged',
      invite: out,
    });
  } catch (err) {
    console.error('❌ Error in /nudge:', err);
    return res
      .status(500)
      .json({ error: 'Failed to nudge recipient', details: err.message });
  }
});

module.exports = router;
