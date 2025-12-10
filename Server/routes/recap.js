const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Post } = require('../models/Post'); // adjust path as needed
const { Types } = mongoose;
const verifyToken = require('../middleware/verifyToken');

router.get('/recap-candidates', verifyToken, async (req, res, next) => {
  try {
    const authUser = req.user; // assuming you attach user in auth middleware
    if (!authUser || !authUser._id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = new Types.ObjectId(authUser._id);

    // configurable window in hours: default 48h
    const windowHours = Number(req.query.windowHours || 48);
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

    // optional: avoid prompting immediately after the start time
    const minAgeHours = Number(req.query.minAgeHours || 2);
    const maxRecent = new Date(now.getTime() - minAgeHours * 60 * 60 * 1000);

    // limit number of invites returned
    const limit = Math.min(Number(req.query.limit) || 5, 20);

    const pipeline = [
      {
        // 1) invites this user accepted, whose start time is in [windowStart, maxRecent]
        $match: {
          type: 'invite',
          visibility: 'visible',
          'details.dateTime': { $gte: windowStart, $lte: maxRecent },
          'details.recipients': {
            $elemMatch: {
              userId,
              status: 'accepted',
              // later you can add:
              // recapDismissed: { $ne: true },
              // went: { $ne: 'went' },
            },
          },
        },
      },
      {
        // 2) Pull out this user's recipient entry for convenience
        $addFields: {
          recipient: {
            $first: {
              $filter: {
                input: '$details.recipients',
                as: 'r',
                cond: { $eq: ['$$r.userId', userId] },
              },
            },
          },
        },
      },
      {
        // 3) Look for an existing recap (review/check-in) owned by this user
        $lookup: {
          from: 'posts', // same collection as Post
          let: { inviteId: '$_id', ownerId: userId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$ownerId', '$$ownerId'] },
                    { $in: ['$type', ['review', 'check-in']] },
                    { $eq: ['$refs.relatedInviteId', '$$inviteId'] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'existingRecap',
        },
      },
      {
        // 4) Only keep invites where no recap exists
        $match: {
          $expr: {
            $eq: [{ $size: '$existingRecap' }, 0],
          },
        },
      },
      {
        // 5) Sort most recent first
        $sort: { 'details.dateTime': -1 },
      },
      {
        $limit: limit,
      },
      {
        // 6) Trim payload: you don't need comments/likes/media blobs here
        $project: {
          existingRecap: 0,
          comments: 0,
          likes: 0,
          stats: 0,
          taggedUsers: 0,
          media: 0,
        },
      },
    ];

    const invitesNeedingRecap = await Post.aggregate(pipeline).exec();

    return res.json({ invites: invitesNeedingRecap });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
