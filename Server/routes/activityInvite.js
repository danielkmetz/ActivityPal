const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

const User = require('../models/User');
const Business = require('../models/Business');
const Post = require('../models/Post');                 // ⬅️ unified model
const { getPresignedUrl } = require('../utils/cachePresignedUrl');

dayjs.extend(utc);
dayjs.extend(timezone);

const DISPLAY_TZ = 'America/Chicago';
const fmtWhen = (iso) =>
  iso ? dayjs.utc(iso).tz(DISPLAY_TZ).format('MMMM D [at] h:mm A') : '';

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
 * Serialize a Post (type: 'invite') into your existing client shape.
 * (You can remove this once GraphQL exclusively serves invites.)
 */
async function serializeInvitePost(postDoc) {
  const post = postDoc.toObject ? postDoc.toObject() : postDoc;

  // Business snapshot
  let businessName = null;
  let businessLogoUrl = null;
  let business = null;

  if (post.placeId) {
    business = await Business.findOne({ placeId: post.placeId }).lean();
    if (business) {
      businessName = business.businessName || 'Unknown Business';
      if (business.logoKey) {
        businessLogoUrl = await getPresignedUrl(business.logoKey);
      }
    }
  }

  // Resolve users (sender + recipients + requests)
  const allUserIds = [
    post.userId,
    ...(post.recipients || []).map((r) => r.userId),
    ...(post.requests || []).map((r) => r.userId),
  ].filter(Boolean);

  const usersMap = await loadUsersMap(allUserIds);

  const senderUser = usersMap.get(String(post.userId));
  const sender = senderUser || {
    id: String(post.userId || ''),
    firstName: '',
    lastName: '',
    profilePicUrl: null,
  };

  const recipients = (post.recipients || []).map((r) => mapRecipient(r, usersMap));
  const requests = (post.requests || []).map((r) => mapRequest(r, usersMap));

  return {
    __typename: 'ActivityInvite',
    _id: String(post._id),
    type: 'invite',
    sender,
    recipients,
    requests,
    placeId: post.placeId ? String(post.placeId) : null,
    businessName,
    businessLogoUrl,
    note: post.note || null,
    dateTime: post.dateTime ? String(post.dateTime) : '',
    message: post.message || null,
    isPublic: Boolean(post.isPublic),
    status: post.status || 'pending',
    createdAt: post.createdAt ? String(post.createdAt) : new Date().toISOString(),
    sortDate: post.sortDate || post.createdAt || post.dateTime || new Date().toISOString(),
    likes: post.likes || [],
    comments: post.comments || [],
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
    businessName, // used only if we need to create the business
    location,     // optional
  } = req.body;

  try {
    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    // Ensure business exists (same behavior as before)
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

    // Create unified post
    const post = await Post.create({
      type: 'invite',
      userId: senderId, // sender
      placeId,
      dateTime,
      message,
      isPublic: !!isPublic,
      note,
      recipients: recipientIds.map((id) => ({ userId: id, status: 'pending' })),
      requests: [],
      status: 'pending',
      likes: [],
      comments: [],
      sortDate: dateTime || new Date(),
    });

    // Notifications
    const formattedDateTime = fmtWhen(dateTime);
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
        $addToSet: { activityInvites: post._id }, // keep legacy pointer if you still use it
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

    const post = await Post.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const row = (post.recipients || []).find((r) => String(r.userId) === String(recipientId));
    if (row) row.status = 'accepted';

    post.status = computeInviteStatus(post.recipients);
    await post.save();

    // Remove original "activityInvite" notif for this recipient
    recipient.notifications = (recipient.notifications || []).filter(
      (n) => !(n.type === 'activityInvite' && String(n.relatedId) === String(post.userId))
    );
    await recipient.save();

    // Notify sender
    const business = await Business.findOne({ placeId: post.placeId }).lean();
    const formattedDate = fmtWhen(post.dateTime);
    const acceptedCount = (post.recipients || []).filter((r) => r.status === 'accepted').length;

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
      User.findByIdAndUpdate(post.userId, { $push: { notifications: senderNotification } }),
      User.findByIdAndUpdate(recipientId, { $push: { notifications: recipientConfirmation } }),
    ]);

    // Optional: business threshold notif
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
    return res.status(200).json({ success: true, message: 'Invite accepted!', invite: out });
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

    const post = await Post.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const row = (post.recipients || []).find((r) => String(r.userId) === String(recipientId));
    if (row) row.status = 'declined';

    post.status = computeInviteStatus(post.recipients);
    await post.save();

    // Remove original notif
    recipient.notifications = (recipient.notifications || []).filter(
      (n) => !(n.type === 'activityInvite' && String(n.relatedId) === String(post.userId))
    );
    await recipient.save();

    const business = await Business.findOne({ placeId: post.placeId }).lean();
    const formattedDate = fmtWhen(post.dateTime);

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
      User.findByIdAndUpdate(post.userId, { $push: { notifications: senderNotification } }),
      User.findByIdAndUpdate(recipientId, { $push: { notifications: recipientConfirmation } }),
    ]);

    const out = await serializeInvitePost(post);
    return res.status(200).json({ success: true, message: 'Invite declined, sender notified.', invite: out });
  } catch (err) {
    console.error('❌ Error in /reject:', err);
    return res.status(500).json({ error: 'Failed to decline invite', details: err.message });
  }
});

/* --------------------------- /edit --------------------------- */

router.put('/edit', async (req, res) => {
  const { recipientId: senderId, inviteId, updates = {}, recipientIds = [] } = req.body;

  try {
    const post = await Post.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    if (String(post.userId) !== String(senderId)) {
      return res.status(400).json({ error: 'Only the sender can edit this invite' });
    }

    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    const prevRecipients = Array.isArray(post.recipients) ? post.recipients : [];
    const prevRequests = Array.isArray(post.requests) ? post.requests : [];

    const prevById = new Map(prevRecipients.map((r) => [String(r.userId), { userId: r.userId, status: r.status }]));
    const nextIds = (recipientIds || []).map(String);
    const nextSet = new Set(nextIds);
    const prevSet = new Set(prevRecipients.map((r) => String(r.userId)));

    // merge recipients
    const mergedRecipients = nextIds.map((id) => {
      const prev = prevById.get(id);
      return prev ? { userId: prev.userId, status: prev.status } : { userId: id, status: 'pending' };
    });

    Object.assign(post, {
      message: updates.message ?? post.message,
      dateTime: updates.dateTime ?? post.dateTime,
      isPublic: typeof updates.isPublic === 'boolean' ? updates.isPublic : post.isPublic,
      note: updates.note ?? post.note,
      placeId: updates.placeId ?? post.placeId,
      recipients: mergedRecipients,
      requests: prevRequests.filter((r) => !nextSet.has(String(r.userId))),
    });

    post.status = computeInviteStatus(post.recipients);
    await post.save();

    const business = await Business.findOne({ placeId: post.placeId }).lean();
    const formattedDateTime = fmtWhen(post.dateTime);
    const updatedMessage = `${sender.firstName} invited you to ${business?.businessName || 'a place'} on ${formattedDateTime}`;

    // Upsert/update recipient notifications
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

    // Remove notifications from removed recipients
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
  const { senderId, inviteId, recipientIds = [] } = req.body;

  try {
    const post = await Post.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });
    if (String(post.userId) !== String(senderId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await Post.deleteOne({ _id: inviteId });

    // Remove notifications/pointers for all involved users
    const allIds = [senderId, ...recipientIds];
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
    const post = await Post.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const alreadyRequested = (post.requests || []).some((r) => String(r.userId) === String(userId));
    const alreadyInvited = (post.recipients || []).some((r) => String(r.userId) === String(userId));
    if (alreadyRequested || alreadyInvited) {
      return res.status(400).json({ error: 'You have already requested or been invited' });
    }

    post.requests = post.requests || [];
    post.requests.push({ userId, status: 'pending' });
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
    const post = await Post.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const idx = (post.requests || []).findIndex((r) => String(r.userId) === String(userId));
    if (idx === -1) return res.status(400).json({ error: 'Request not found' });

    post.requests.splice(idx, 1);
    post.recipients = post.recipients || [];
    post.recipients.push({ userId, status: 'accepted' });

    post.status = computeInviteStatus(post.recipients);
    await post.save();

    await User.updateOne({ _id: userId }, { $addToSet: { activityInvites: post._id } });

    // Clean request notification from sender, if any
    await User.updateOne(
      { _id: post.userId },
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
    const post = await Post.findOne({ _id: inviteId, type: 'invite' });
    if (!post) return res.status(404).json({ error: 'Invite not found' });

    const before = (post.requests || []).length;
    post.requests = (post.requests || []).filter((r) => String(r.userId) !== String(userId));
    if (post.requests.length === before) {
      return res.status(400).json({ error: 'Request not found' });
    }

    await post.save();

    await User.updateOne(
      { _id: post.userId },
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

module.exports = router;
