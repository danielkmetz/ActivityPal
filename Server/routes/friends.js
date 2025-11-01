const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken'); // Import your middleware
const { resolveUserProfilePics } = require('../utils/userPosts');
const { Types } = require('mongoose');

const oid = (v) => (Types.ObjectId.isValid(v) ? new Types.ObjectId(String(v)) : null);
const sameId = (a, b) => String(a) === String(b);

// Send Follow Request
router.post('/follow-request', verifyToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const { targetUserId } = req.body || {};
    if (!oid(followerId) || !oid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid ids.' });
    }
    if (sameId(followerId, targetUserId)) {
      return res.status(400).json({ message: 'You cannot follow yourself.' });
    }

    // Pre-check: target exists and not already followed
    const target = await User.findById(targetUserId).select('_id followers privacySettings').lean();
    if (!target) return res.status(404).json({ message: 'Target user not found.' });
    if ((target.followers || []).some(id => sameId(id, followerId))) {
      return res.status(400).json({ message: 'Already following this user.' });
    }

    // Use $addToSet to avoid duplicates; do NOT push then save
    await Promise.all([
      User.updateOne(
        { _id: followerId },
        { $addToSet: { 'followRequests.sent': oid(targetUserId) } }
      ),
      User.updateOne(
        { _id: targetUserId },
        { $addToSet: { 'followRequests.received': oid(followerId) } }
      ),
    ]);

    // If you need enriched sender data:
    const follower = await User.findById(followerId).select('_id firstName lastName profilePic').lean();
    // (Resolve presigned URL if needed)

    return res.status(200).json({
      message: 'Follow request sent.',
      follower: {
        _id: follower._id,
        firstName: follower.firstName,
        lastName: follower.lastName,
        profilePic: follower.profilePic || null,
        // presignedProfileUrl
      },
    });
  } catch (err) {
    console.error('❌ Error sending follow request:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
});

// Approve a follow request
router.post('/approve-follow-request', verifyToken, async (req, res) => {
  try {
    const recipientId = req.user.id;
    const { requesterId } = req.body || {};
    if (!oid(recipientId) || !oid(requesterId)) {
      return res.status(400).json({ message: 'Invalid ids.' });
    }

    // Ensure there was a request (optional; $pull/$addToSet are safe anyway)
    const had = await User.exists({
      _id: recipientId,
      'followRequests.received': oid(requesterId),
    });
    if (!had) return res.status(400).json({ message: 'No follow request from this user.' });

    await Promise.all([
      // Remove request both sides
      User.updateOne(
        { _id: recipientId },
        { $pull: { 'followRequests.received': oid(requesterId) } }
      ),
      User.updateOne(
        { _id: requesterId },
        { $pull: { 'followRequests.sent': oid(recipientId) } }
      ),
      // Add follower/following
      User.updateOne(
        { _id: recipientId },
        { $addToSet: { followers: oid(requesterId) } }
      ),
      User.updateOne(
        { _id: requesterId },
        { $addToSet: { following: oid(recipientId) } }
      ),
      // Update the pending notification to "accepted" (match with ObjectId)
      User.updateOne(
        { _id: recipientId, 'notifications.relatedId': oid(requesterId), 'notifications.type': 'followRequest' },
        { $set: { 'notifications.$.type': 'followRequestAccepted' } }
      ),
    ]);

    const requester = await User.findById(requesterId)
      .select('_id firstName lastName email isBusiness profilePic').lean();

    res.status(200).json({
      message: 'Follow request approved.',
      follower: {
        _id: requester._id,
        firstName: requester.firstName,
        lastName: requester.lastName,
        email: requester.email,
        isBusiness: requester.isBusiness,
        profilePic: requester.profilePic || null,
      },
    });
  } catch (error) {
    console.error('❌ Error approving follow request:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Decline Follow Request
router.post('/decline-follow-request', verifyToken, async (req, res) => {
  try {
    const recipientId = req.user.id;
    const { requesterId } = req.body || {};
    if (!oid(recipientId) || !oid(requesterId)) {
      return res.status(400).json({ message: 'Invalid ids.' });
    }

    await Promise.all([
      User.updateOne(
        { _id: recipientId },
        { $pull: { 'followRequests.received': oid(requesterId) } }
      ),
      User.updateOne(
        { _id: requesterId },
        { $pull: { 'followRequests.sent': oid(recipientId) } }
      ),
      User.updateOne(
        { _id: recipientId },
        { $pull: { notifications: { type: 'followRequest', relatedId: oid(requesterId) } } }
      ),
    ]);

    res.status(200).json({ message: 'Follow request declined.' });
  } catch (error) {
    console.error('Error declining follow request:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Unfollow
router.delete('/unfollow/:targetUserId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.params || {};
    if (!oid(userId) || !oid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid ids.' });
    }
    if (sameId(userId, targetUserId)) {
      return res.status(400).json({ message: 'Invalid operation.' });
    }

    // Pull from both sides; idempotent
    await Promise.all([
      User.updateOne({ _id: userId }, { $pull: { following: oid(targetUserId) } }),
      User.updateOne({ _id: targetUserId }, { $pull: { followers: oid(userId) } }),
      User.updateOne(
        { _id: userId },
        { $pull: { notifications: { type: { $in: ['followRequestAccepted', 'follow', 'followRequest'] }, relatedId: oid(targetUserId) } } }
      ),
      User.updateOne(
        { _id: targetUserId },
        { $pull: { notifications: { type: { $in: ['followRequestAccepted', 'follow', 'followRequest'] }, relatedId: oid(userId) } } }
      ),
    ]);

    res.status(200).json({ message: 'Successfully unfollowed the user.' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/cancel-follow-request', verifyToken, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { recipientId } = req.body || {};
    if (!oid(senderId) || !oid(recipientId)) {
      return res.status(400).json({ message: 'Invalid ids.' });
    }

    // Atomic pulls (even if already missing, idempotent)
    await Promise.all([
      User.updateOne(
        { _id: senderId },
        { $pull: { 'followRequests.sent': oid(recipientId) } }
      ),
      User.updateOne(
        { _id: recipientId },
        { $pull: { 'followRequests.received': oid(senderId) } }
      ),
      User.updateOne(
        { _id: recipientId },
        { $pull: { notifications: { type: 'followRequest', relatedId: oid(senderId) } } }
      ),
    ]);

    res.status(200).json({ message: 'Follow request canceled.' });
  } catch (error) {
    console.error('Error canceling follow request:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Suggested Friends based on mutual friends
router.get('/suggested-friends/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`🔍 Requested suggested friends for userId: ${userId}`);
    console.log(`🛡️ Authenticated userId from token: ${req.user.id}`);

    if (userId !== req.user.id) {
      console.warn('❌ Unauthorized access attempt.');
      return res.status(403).json({ message: 'Unauthorized access.' });
    }

    const currentUser = await User.findById(userId).select('friends friendRequests');

    if (!currentUser) {
      console.warn(`⚠️ User not found for ID: ${userId}`);
      return res.status(404).json({ message: 'User not found.' });
    }

    const allUsers = await User.find({ _id: { $ne: userId } }).select('_id firstName lastName profilePic friends');

    const currentFriendIds = new Set(currentUser.friends.map(id => id.toString()));
    const sentRequests = new Set((currentUser.friendRequests?.sent || []).map(id => id.toString()));
    const receivedRequests = new Set((currentUser.friendRequests?.received || []).map(id => id.toString()));

    const suggestions = allUsers
      .filter(user =>
        !currentFriendIds.has(user._id.toString()) &&
        !sentRequests.has(user._id.toString()) &&
        !receivedRequests.has(user._id.toString())
      )
      .map(user => {
        const mutualCount = user.friends.filter(fid => currentFriendIds.has(fid.toString())).length;
        return { ...user.toObject(), mutualCount };
      })
      .filter(user => user.mutualCount > 0)
      .sort((a, b) => b.mutualCount - a.mutualCount)
      .slice(0, 10); // Return top 10 suggestions

    const suggestionIds = suggestions.map(u => u._id);
    const profilePicsMap = await resolveUserProfilePics(suggestionIds);

    const enrichedSuggestions = suggestions.map(user => {
      const userIdStr = user._id.toString();
      return {
        ...user,
        profilePic: profilePicsMap[userIdStr]?.profilePic || null,
        presignedProfileUrl: profilePicsMap[userIdStr]?.profilePicUrl || null,
      };
    });

    console.log(`🎯 Returning ${enrichedSuggestions.length} enriched suggestions with profile pics`);
    res.status(200).json(enrichedSuggestions);
  } catch (error) {
    console.error('💥 Error fetching suggested friends:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

//follow immediately
router.post('/follow/:targetUserId', verifyToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const { targetUserId } = req.params || {};
    const { isFollowBack } = req.body || {};
    if (!oid(followerId) || !oid(targetUserId)) {
      return res.status(400).json({ message: 'Invalid ids.' });
    }
    if (sameId(followerId, targetUserId)) {
      return res.status(400).json({ message: 'Cannot follow yourself.' });
    }

    const target = await User.findById(targetUserId).select('_id firstName lastName profilePic privacySettings').lean();
    if (!target) return res.status(404).json({ message: 'Target user not found.' });
    if (target?.privacySettings?.profileVisibility === 'private') {
      return res.status(403).json({ message: 'This user requires follow approval.' });
    }

    await Promise.all([
      User.updateOne({ _id: followerId }, { $addToSet: { following: oid(targetUserId) } }),
      User.updateOne({ _id: targetUserId }, { $addToSet: { followers: oid(followerId) } }),
      // optional: clean up any stale requests between these users
      User.updateOne({ _id: followerId }, { $pull: { 'followRequests.sent': oid(targetUserId) } }),
      User.updateOne({ _id: targetUserId }, { $pull: { 'followRequests.received': oid(followerId) } }),
      isFollowBack
        ? User.updateOne(
            { _id: followerId },
            { $pull: { notifications: { type: 'followRequestAccepted', relatedId: oid(targetUserId) } } }
          )
        : Promise.resolve(),
    ]);

    const picMap = await resolveUserProfilePics([targetUserId]);
    const enriched = {
      _id: target._id,
      firstName: target.firstName,
      lastName: target.lastName,
      profilePic: picMap[targetUserId]?.profilePic || null,
      presignedProfileUrl: picMap[targetUserId]?.profilePicUrl || null,
    };

    res.status(200).json({ message: 'Followed successfully.', targetUser: enriched });
  } catch (err) {
    console.error('❌ Error following user:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET followers and following for a user
router.get('/followers-following/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate({
        path: 'followers',
        select: '_id firstName lastName profilePic privacySettings following followers',
        populate: { // populate the followers' following list
          path: 'following',
          select: '_id',
        }
      })
      .populate({
        path: 'following',
        select: '_id firstName lastName profilePic privacySettings following followers',
        populate: { // populate the following's following list
          path: 'following',
          select: '_id',
        }
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const allUsers = [...user.followers, ...user.following];
    const userIds = allUsers.map(u => u._id.toString());
    const profilePicMap = await resolveUserProfilePics(userIds);

    const attachProfileUrls = (users) =>
      users.map(u => ({
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        profilePic: u.profilePic || null,
        profilePicUrl: profilePicMap[u._id.toString()]?.profilePicUrl || null,
        privacySettings: u.privacySettings || {},
        following: u.following || [],
      }));

    res.status(200).json({
      followers: attachProfileUrls(user.followers),
      following: attachProfileUrls(user.following),
    });
  } catch (err) {
    console.error('Error fetching followers/following:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

//fetch enriched follow requests
router.get('/follow-requests', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select('followRequests')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const sentIds = user.followRequests?.sent || [];
    const receivedIds = user.followRequests?.received || [];

    const allUserIds = [...sentIds, ...receivedIds];
    const users = await User.find({ _id: { $in: allUserIds } }).select('_id firstName lastName profilePic').lean();
    const profilePicMap = await resolveUserProfilePics(allUserIds);

    const enrich = (ids) =>
      ids.map(id => {
        const u = users.find(user => user._id.toString() === id.toString());
        const pic = profilePicMap[id.toString()] || {};
        return {
          _id: id,
          firstName: u?.firstName || '',
          lastName: u?.lastName || '',
          presignedProfileUrl: pic.profilePicUrl || null,
          profilePic: pic.profilePic || null,
        };
      });

    res.status(200).json({
      sent: enrich(sentIds),
      received: enrich(receivedIds),
    });
  } catch (err) {
    console.error('❌ Error fetching follow requests:', err);
    res.status(500).json({ message: 'Failed to fetch follow requests' });
  }
});

//fetch users that follow each other
router.get('/:userId/friends', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('following').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Find mutuals: users who are followed by the user AND follow them back
    const mutuals = await User.find({
      _id: { $in: user.following },
      following: userId,
    }).select('_id firstName lastName profilePic').lean();

    // Get enriched profile pic data
    const userIds = mutuals.map(u => u._id);
    const picMap = await resolveUserProfilePics(userIds);

    const enriched = mutuals.map(user => {
      const picData = picMap[user._id.toString()] || {};
      return {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        profilePic: picData.profilePic || null,
        profilePicUrl: picData.profilePicUrl || null,
      };
    });

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Error fetching mutual follows:', err);
    res.status(500).json({ message: 'Failed to fetch friends' });
  }
});

module.exports = router;
