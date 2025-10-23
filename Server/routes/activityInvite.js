const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Business = require('../models/Business');
const ActivityInvite = require('../models/ActivityInvites.js')
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const mongoose = require('mongoose');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

dayjs.extend(utc);
dayjs.extend(timezone);

const DISPLAY_TZ = 'America/Chicago';
const fmtWhen = (iso) => dayjs.utc(iso).tz(DISPLAY_TZ).format('MMMM D [at] h:mm A');

async function loadUsersMap(userIds = []) {
  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } })
    .select('_id firstName lastName profilePic')
    .lean();

  const entries = await Promise.all(users.map(async (u) => {
    const url = u?.profilePic?.photoKey ? await getPresignedUrl(u.profilePic.photoKey) : null;
    return [String(u._id), {
      id: String(u._id),
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      profilePicUrl: url,
    }];
  }));

  return new Map(entries);
}

function toInviteUser(userObjOrMapEntry) {
  if (!userObjOrMapEntry) return { id: '', firstName: '', lastName: '', profilePicUrl: null };
  // Accepts either { id, firstName, lastName, profilePicUrl } from the map
  // or a raw mongoose user-like object.
  if (userObjOrMapEntry.id) return userObjOrMapEntry;
  return {
    id: String(userObjOrMapEntry._id || ''),
    firstName: userObjOrMapEntry.firstName || '',
    lastName: userObjOrMapEntry.lastName || '',
    profilePicUrl: userObjOrMapEntry.profilePicUrl || null,
  };
}

function toRecipient(rec, usersMap) {
  const u = usersMap.get(String(rec.userId));
  return {
    userId: String(rec.userId),
    status: rec.status || 'pending',
    firstName: u?.firstName || '',
    lastName: u?.lastName || '',
    profilePicUrl: u?.profilePicUrl || null,
  };
}

function toRequest(reqItem, usersMap) {
  const u = usersMap.get(String(reqItem.userId));
  return {
    _id: reqItem?._id ? String(reqItem._id) : undefined,
    userId: String(reqItem.userId),
    status: reqItem?.status || 'pending',
    firstName: u?.firstName || '',
    lastName: u?.lastName || '',
    profilePicUrl: u?.profilePicUrl || null,
  };
}

/**
 * Serialize an ActivityInvite mongoose doc to your GraphQL ActivityInvite shape.
 * Ensures top-level businessName/businessLogoUrl and flat sender/recipients/requests.
 */
async function serializeInvite(inviteDoc, options = {}) {
  const invite = inviteDoc.toObject ? inviteDoc.toObject() : inviteDoc;

  // Business fields (top-level in your typedef)
  let businessName = null;
  let businessLogoUrl = null;

  let business = options.business;
  if (!business && invite.placeId) {
    business = await Business.findOne({ placeId: invite.placeId }).lean();
  }
  if (business) {
    businessName = business.businessName || 'Unknown Business';
    if (business.logoKey) {
      businessLogoUrl = await getPresignedUrl(business.logoKey);
    }
  }

  // Build a users map for recipients + requests + sender
  const recipientIds = (invite.recipients || []).map(r => r.userId);
  const requestIds   = (invite.requests   || []).map(r => r.userId);
  const allUserIds   = [
    ...(recipientIds || []),
    ...(requestIds || []),
    invite.senderId,
  ].filter(Boolean);

  const usersMap = await loadUsersMap(allUserIds);

  // Sender
  let sender = options.sender || usersMap.get(String(invite.senderId));
  sender = toInviteUser(sender);

  // Recipients
  const recipients = (invite.recipients || []).map(r => toRecipient(r, usersMap));

  // Requests
  const requests = (invite.requests || []).map(r => toRequest(r, usersMap));

  return {
    _id: String(invite._id),
    sender,
    recipients,
    placeId: String(invite.placeId),
    businessName,
    businessLogoUrl,
    note: invite.note || null,
    dateTime: invite.dateTime ? String(invite.dateTime) : '',
    message: invite.message || null,
    isPublic: Boolean(invite.isPublic),
    status: invite.status || 'pending',
    createdAt: invite.createdAt ? String(invite.createdAt) : new Date().toISOString(),
    likes: invite.likes || [],
    comments: invite.comments || [],
    type: 'invite',
    requests,
    sortDate: invite.sortDate || null,
  };
}

router.post('/send', async (req, res) => {
  const { senderId, recipientIds, placeId, dateTime, message, isPublic, note, businessName, location } = req.body;

  try {
    const sender = await User.findById(senderId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    // ensure business
    let business = await Business.findOne({ placeId }).lean();
    if (!business) {
      const newBusiness = await Business.create({
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
      business = newBusiness.toObject();
    }

    const formattedDateTime = fmtWhen(invite.dateTime);

    const invite = await ActivityInvite.create({
      senderId,
      recipients: recipientIds.map(id => ({ userId: id, status: 'pending' })),
      placeId,
      dateTime,
      message,
      isPublic,
      note,
      status: 'pending',
    });

    // base notif
    const notification = {
      type: 'activityInvite',
      message: `${sender.firstName} invited you to ${business.businessName} on ${formattedDateTime}`,
      relatedId: sender._id,
      targetId: invite._id,
      typeRef: 'User',
      postType: 'activityInvite',
      createdAt: new Date(),
    };

    const recipientUpdates = recipientIds.map(id =>
      User.findByIdAndUpdate(id, {
        $addToSet: { activityInvites: invite._id },
        $push: { notifications: notification },
      })
    );

    const senderUpdate = User.findByIdAndUpdate(senderId, {
      $addToSet: { activityInvites: invite._id },
    });

    await Promise.all([...recipientUpdates, senderUpdate]);

    // serialize to GraphQL shape
    const out = await serializeInvite(invite, { business });
    res.status(200).json({ success: true, message: 'Invite sent!', invite: out });
  } catch (err) {
    console.error('❌ Failed to send invite:', err);
    res.status(500).json({ error: 'Failed to send invite', details: err.message });
  }
});

// Accept an activity invite
router.post('/accept', async (req, res) => {
  const { recipientId, inviteId } = req.body;

  try {
    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    const invite = await ActivityInvite.findById(inviteId);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    // update recipient status
    const recipientEntry = invite.recipients.find(r => String(r.userId) === String(recipientId));
    if (recipientEntry) recipientEntry.status = 'accepted';

    const allAccepted = invite.recipients.every(r => r.status === 'accepted');
    const anyDeclined = invite.recipients.some(r => r.status === 'declined');
    const anyPending  = invite.recipients.some(r => r.status === 'pending');

    if (allAccepted) invite.status = 'accepted';
    else if (anyDeclined && !anyPending) invite.status = 'declined';
    else invite.status = 'pending';

    await invite.save();

    const acceptedCount = invite.recipients.filter(r => r.status === 'accepted').length;

    // remove original invite notif from recipient
    recipient.notifications = recipient.notifications.filter(n =>
      !(n.type === 'activityInvite' && String(n.relatedId) === String(invite.senderId))
    );
    await recipient.save();

    const business = await Business.findOne({ placeId: invite.placeId }).lean();
    const formattedDate = fmtWhen(invite.dateTime);

    const senderNotification = {
      type: 'activityInviteAccepted',
      message: business
        ? `🎉 Your activity invite for ${business.businessName} now has ${acceptedCount} accepted.`
        : `🎉 Your activity invite now has ${acceptedCount} accepted.`,
      relatedId: recipient._id,
      typeRef: 'ActivityInvite',
      postType: 'activityInviteAccepted',
      targetId: invite._id,
      createdAt: new Date(),
    };

    const recipientConfirmation = {
      type: 'activityInviteAccepted',
      message: business
        ? `You accepted the invite to ${business.businessName} on ${formattedDate}`
        : `You accepted the invite on ${formattedDate}`,
      relatedId: invite._id,
      typeRef: 'ActivityInvite',
      targetId: invite._id,
      postType: 'activityInviteConfirmed',
      createdAt: new Date(),
    };

    await Promise.all([
      User.findByIdAndUpdate(invite.senderId, { $push: { notifications: senderNotification } }),
      User.findByIdAndUpdate(recipientId, { $push: { notifications: recipientConfirmation } }),
    ]);

    // optional business notif threshold
    if (acceptedCount >= 5 && business?. _id) {
      await Business.findByIdAndUpdate(business._id, {
        $push: {
          notifications: {
            type: 'activityInvite',
            message: `🎉 A group event at your business (${business.businessName}) just reached ${acceptedCount} attendees!`,
            relatedId: invite._id,
            typeRef: 'ActivityInvite',
            targetId: invite._id,
            postType: 'activityInvite',
            createdAt: new Date(),
          }
        }
      });
    }

    const out = await serializeInvite(invite, { business });
    res.status(200).json({ success: true, message: 'Invite accepted!', invite: out });
  } catch (err) {
    console.error('❌ Error in /accept:', err);
    res.status(500).json({ error: 'Failed to accept invite', details: err.message });
  }
});

router.post('/reject', async (req, res) => {
  const { recipientId, inviteId } = req.body;

  try {
    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    const invite = await ActivityInvite.findById(inviteId);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    // set status for this recipient
    const entry = invite.recipients.find(r => String(r.userId) === String(recipientId));
    if (entry) entry.status = 'declined';

    const allAccepted = invite.recipients.every(r => r.status === 'accepted');
    const anyDeclined = invite.recipients.some(r => r.status === 'declined');
    const anyPending  = invite.recipients.some(r => r.status === 'pending');

    if (allAccepted) invite.status = 'accepted';
    else if (anyDeclined && !anyPending) invite.status = 'declined';
    else invite.status = 'pending';

    await invite.save();

    // remove original activityInvite notif from recipient
    recipient.notifications = recipient.notifications.filter(n =>
      !(n.type === 'activityInvite' && String(n.relatedId) === String(invite.senderId))
    );
    await recipient.save();

    const business = await Business.findOne({ placeId: invite.placeId }).lean();
    const formattedDate = fmtWhen(invite.dateTime);

    const senderNotification = {
      type: 'activityInviteDeclined',
      message: business
        ? `${recipient.firstName} declined your activity invite to ${business.businessName} on ${formattedDate}`
        : `${recipient.firstName} declined your activity invite on ${formattedDate}`,
      relatedId: recipient._id,
      typeRef: 'User',
      postType: 'activityInviteDeclined',
      createdAt: new Date(),
    };

    const recipientConfirmation = {
      type: 'activityInviteDeclined',
      message: business
        ? `You declined the invite to ${business.businessName} on ${formattedDate}`
        : `You declined the invite on ${formattedDate}`,
      relatedId: invite._id,
      typeRef: 'ActivityInvite',
      postType: 'activityInviteDeclinedConfirmation',
      createdAt: new Date(),
    };

    await Promise.all([
      User.findByIdAndUpdate(invite.senderId, { $push: { notifications: senderNotification } }),
      User.findByIdAndUpdate(recipientId, { $push: { notifications: recipientConfirmation } }),
    ]);

    const out = await serializeInvite(invite, { business });
    res.status(200).json({ success: true, message: 'Invite declined, sender notified.', invite: out });
  } catch (err) {
    console.error('❌ Error in /reject:', err);
    res.status(500).json({ error: 'Failed to decline invite', details: err.message });
  }
});

router.put('/edit', async (req, res) => {
  const { recipientId, inviteId, updates, recipientIds = [] } = req.body;

  try {
    const invite = await ActivityInvite.findById(inviteId);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    if (String(invite.senderId) !== String(recipientId)) {
      return res.status(400).json({ error: 'Only the sender can edit this invite' });
    }

    const sender = await User.findById(recipientId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });

    const prevRecipients = Array.isArray(invite.recipients) ? invite.recipients : [];
    const prevRequests   = Array.isArray(invite.requests)   ? invite.requests   : [];

    const prevById = new Map(prevRecipients.map(r => [String(r.userId), { userId: r.userId, status: r.status }]));
    const nextIds  = recipientIds.map(String);
    const nextSet  = new Set(nextIds);
    const prevSet  = new Set(prevRecipients.map(r => String(r.userId)));

    // merge recipients
    const mergedRecipients = nextIds.map(id => {
      const prev = prevById.get(id);
      return prev ? { userId: prev.userId, status: prev.status } : { userId: id, status: 'pending' };
    });

    Object.assign(invite, updates);
    invite.recipients = mergedRecipients;
    invite.requests = prevRequests.filter(r => !nextSet.has(String(r.userId)));

    await invite.save();

    const business = await Business.findOne({ placeId: invite.placeId }).lean();

    // Maintain or update notifications for recipients (same logic you had)
    const formattedDateTime = fmtWhen(invite.dateTime);
    const updatedMessage = `${sender.firstName} invited you to ${business?.businessName || 'a place'} on ${formattedDateTime}`;

    await Promise.all(nextIds.map(async (uid) => {
      const user = await User.findById(uid);
      if (!user) return;

      if (!user.activityInvites.some(id => String(id) === String(inviteId))) {
        user.activityInvites.push(invite._id);
      }

      const existing = user.notifications.find(n =>
        n.type === 'activityInvite' &&
        String(n.relatedId) === String(sender._id) &&
        n.postType === 'activityInvite'
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
          postType: 'activityInvite',
          createdAt: new Date(),
        });
      }
      await user.save();
    }));

    const removedIds = [...prevSet].filter(id => !nextSet.has(id));
    await Promise.all(removedIds.map(async (rid) => {
      await User.findByIdAndUpdate(rid, {
        $pull: {
          activityInvites: invite._id,
          notifications: {
            type: 'activityInvite',
            relatedId: sender._id,
            postType: 'activityInvite',
          },
        }
      });
    }));

    const out = await serializeInvite(invite, { business, sender });
    res.status(200).json({ success: true, message: 'Invite updated', updatedInvite: out });
  } catch (err) {
    console.error('❌ Error editing invite:', err);
    res.status(500).json({ error: 'Failed to edit invite', details: err.message });
  }
});

router.delete('/delete', async (req, res) => {
    const { senderId, inviteId, recipientIds } = req.body;

    try {
        const senderObjectId = new mongoose.Types.ObjectId(senderId);
        const inviteObjectId = new mongoose.Types.ObjectId(inviteId);
        const recipientObjectIds = recipientIds.map(id => new mongoose.Types.ObjectId(id));

        await ActivityInvite.findByIdAndDelete(inviteObjectId);

        await User.findByIdAndUpdate(senderObjectId, {
            $pull: {
                activityInvites: inviteObjectId,
                notifications: { targetId: inviteObjectId },
            },
        });

        const recipientUpdatePromises = recipientObjectIds.map(async (recipientId) => {
            await User.findByIdAndUpdate(recipientId, {
                $pull: {
                    activityInvites: inviteObjectId,
                    notifications: { targetId: inviteObjectId },
                },
            });
        });

        await Promise.all(recipientUpdatePromises);

        res.status(200).json({
            success: true,
            message: 'Invite and all related notifications removed from sender and recipients.',
        });

    } catch (err) {
        console.error('❌ Error deleting invite:', err);
        res.status(500).json({
            error: 'Failed to delete invite',
            details: err.message,
        });
    }
});

router.post('/request', async (req, res) => {
  const { userId, inviteId } = req.body;

  try {
    const invite = await ActivityInvite.findById(inviteId);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    const alreadyRequested = invite.requests?.some(r => String(r.userId) === String(userId));
    const alreadyInvited   = invite.recipients?.some(r => String(r.userId) === String(userId));
    if (alreadyRequested || alreadyInvited) {
      return res.status(400).json({ error: 'You have already requested or been invited' });
    }

    invite.requests.push({ userId }); // status will serialize as "pending"
    await invite.save();

    const out = await serializeInvite(invite);
    res.status(200).json({ success: true, message: 'Request sent!', invite: out });
  } catch (err) {
    console.error('❌ Failed to request invite:', err);
    res.status(500).json({ error: 'Failed to request invite', details: err.message });
  }
});

router.post('/accept-user-request', async (req, res) => {
  const { inviteId, userId } = req.body;

  try {
    const invite = await ActivityInvite.findById(inviteId);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    const idx = invite.requests.findIndex(r => String(r.userId) === String(userId));
    if (idx === -1) return res.status(400).json({ error: 'Request not found' });

    invite.requests.splice(idx, 1);
    invite.recipients.push({ userId, status: 'accepted' });
    await invite.save();

    await User.updateOne({ _id: userId }, { $addToSet: { activityInvites: invite._id } });

    await User.updateOne(
      { _id: invite.senderId },
      {
        $pull: {
          notifications: {
            type: 'requestInvite',
            relatedId: userId,
            targetId: inviteId,
            targetRef: 'ActivityInvite',
            typeRef: 'User',
          },
        },
      }
    );

    const out = await serializeInvite(invite);
    res.status(200).json({ success: true, message: 'Request accepted', invite: out });
  } catch (err) {
    console.error('❌ Failed to accept request:', err);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

router.post('/reject-user-request', async (req, res) => {
  const { inviteId, userId } = req.body;

  try {
    const invite = await ActivityInvite.findById(inviteId);
    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    const before = invite.requests.length;
    invite.requests = invite.requests.filter(r => String(r.userId) !== String(userId));
    if (invite.requests.length === before) {
      return res.status(400).json({ error: 'Request not found' });
    }
    await invite.save();

    await User.updateOne(
      { _id: invite.senderId },
      {
        $pull: {
          notifications: {
            type: 'requestInvite',
            relatedId: userId,
            targetId: inviteId,
          },
        },
      }
    );

    const out = await serializeInvite(invite);
    res.status(200).json({ success: true, message: 'Request rejected', invite: out });
  } catch (err) {
    console.error('❌ Failed to reject request:', err);
    res.status(500).json({ error: 'Failed to reject request', details: err.message });
  }
});

module.exports = router;
