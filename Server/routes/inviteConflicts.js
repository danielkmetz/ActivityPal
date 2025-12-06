const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { InvitePost } = require('../models/Post'); // adjust path if needed

const { Types } = mongoose;

router.post('/check-conflicts', async (req, res) => {
  try {
    const { userId, inviteId, dateTime, windowMinutes = 120 } = req.body || {};

    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    let userObjectId;
    try {
      userObjectId = new Types.ObjectId(userId);
    } catch (e) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    // Figure out the center time:
    // 1) If inviteId provided -> fetch invite and use its details.dateTime
    // 2) Else if dateTime provided -> use that
    // 3) Else -> error
    let center;

    if (inviteId) {
      let invite;
      try {
        invite = await InvitePost.findById(inviteId)
          .select('_id type ownerId details.dateTime businessName placeId');
      } catch (e) {
        return res.status(400).json({ message: 'Invalid inviteId' });
      }

      if (!invite || !invite.details || !invite.details.dateTime) {
        return res
          .status(404)
          .json({ message: 'Invite not found or missing dateTime' });
      }

      center = invite.details.dateTime;
    } else if (dateTime) {
      const parsed = new Date(dateTime);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ message: 'Invalid dateTime' });
      }
      center = parsed;
    } else {
      return res
        .status(400)
        .json({ message: 'Either inviteId or dateTime is required' });
    }

    const windowMs = Number(windowMinutes) * 60 * 1000;
    const start = new Date(center.getTime() - windowMs / 2);
    const end = new Date(center.getTime() + windowMs / 2);

    const query = {
      type: 'invite',
      visibility: { $ne: 'deleted' },
      'details.dateTime': { $gte: start, $lte: end },
      $or: [
        { ownerId: userObjectId }, // user is host
        {
          'details.recipients': {
            $elemMatch: {
              userId: userObjectId,
              status: 'accepted',
            },
          },
        },
      ],
    };

    if (inviteId) {
      // Exclude this invite itself when we’re checking conflicts for it
      query._id = { $ne: new Types.ObjectId(inviteId) };
    }

    const docs = await InvitePost.find(query)
      .sort({ 'details.dateTime': 1 })
      .limit(20)
      .select('_id type message businessName placeId details.dateTime ownerId');

    const conflicts = docs.map((doc) => ({
      id: doc._id,
      type: doc.type,
      message: doc.message || '',
      businessName: doc.businessName || null,
      placeId: doc.placeId || null,
      dateTime: doc.details?.dateTime || null,
      isHost: String(doc.ownerId) === String(userObjectId),
    }));

    return res.json({ conflicts });
  } catch (err) {
    console.error('Error in /invites/check-conflicts:', err);
    return res
      .status(500)
      .json({ message: 'Failed to check invite conflicts' });
  }
});

module.exports = router;
