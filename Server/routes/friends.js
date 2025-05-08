const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken'); // Import your middleware
const { resolveUserProfilePics } = require('../utils/userPosts');

// Send Follow Request
router.post('/follow-request', verifyToken, async (req, res) => {
  const followerId = req.user.id;
  const { targetUserId } = req.body;

  if (followerId === targetUserId) {
    return res.status(400).json({ message: 'You cannot follow yourself.' });
  }

  const follower = await User.findById(followerId);
  const targetUser = await User.findById(targetUserId);

  if (!targetUser) return res.status(404).json({ message: 'User not found.' });

  const isPrivate = targetUser.privacySettings?.profileVisibility === 'private';

  // Already following?
  if (follower.following.includes(targetUserId)) {
    return res.status(400).json({ message: 'Already following this user.' });
  }

  if (isPrivate) {
    // Send follow request
    if (targetUser.followRequests.received.includes(followerId)) {
      return res.status(400).json({ message: 'Follow request already sent.' });
    }
    follower.followRequests.sent.push(targetUserId);
    targetUser.followRequests.received.push(followerId);
  } else {
    // Immediately follow
    follower.following.push(targetUserId);
    targetUser.followers.push(followerId);
  }

  await follower.save();
  await targetUser.save();

  res.status(200).json({ message: isPrivate ? 'Follow request sent.' : 'Now following user.' });
});

// Accept Follow Request
router.post('/approve-follow-request', verifyToken, async (req, res) => {
  try {
    const recipientId = req.user.id; // The user approving the follow
    const { requesterId } = req.body; // The user who sent the follow request

    const recipient = await User.findById(recipientId);
    const requester = await User.findById(requesterId).select(
      '_id firstName lastName email isBusiness profilePic followRequests'
    );

    if (!requester) {
      return res.status(404).json({ message: 'Requester user not found.' });
    }

    if (!recipient.followRequests?.received.includes(requesterId)) {
      return res.status(400).json({ message: 'No follow request from this user.' });
    }

    // Remove follow request
    recipient.followRequests.received = recipient.followRequests.received.filter(
      id => id.toString() !== requesterId
    );
    requester.followRequests.sent = requester.followRequests.sent.filter(
      id => id.toString() !== recipientId
    );

    // Update follower/following
    recipient.followers.push(requesterId);
    requester.following.push(recipientId);

    await recipient.save();
    await requester.save();

    // Remove follow request notification
    await User.findByIdAndUpdate(recipientId, {
      $pull: {
        notifications: {
          type: 'followRequest', // You may want to rename this type in your system
          relatedId: new mongoose.Types.ObjectId(requesterId),
        },
      },
    });

    res.status(200).json({
      message: 'Follow request approved.',
      follower: requester,
    });
  } catch (error) {
    console.error('Error approving follow request:', error);
    res.status(500).json({ message: 'Server error.', error });
  }
});

// Decline Follow Request
router.post('/decline-follow-request', verifyToken, async (req, res) => {
  try {
    const recipientId = req.user.id; // Current user (the one declining)
    const { requesterId } = req.body; // The user who sent the follow request

    const recipient = await User.findById(recipientId);
    const requester = await User.findById(requesterId);

    if (!requester) {
      return res.status(404).json({ message: 'Requester user not found.' });
    }

    if (!recipient.followRequests?.received.includes(requesterId)) {
      return res.status(400).json({ message: 'No follow request from this user.' });
    }

    // Remove from followRequests
    recipient.followRequests.received = recipient.followRequests.received.filter(
      id => id.toString() !== requesterId
    );
    requester.followRequests.sent = requester.followRequests.sent.filter(
      id => id.toString() !== recipientId
    );

    await recipient.save();
    await requester.save();

    await User.findByIdAndUpdate(recipientId, {
      $pull: {
        notifications: {
          type: 'followRequest',
          relatedId: new mongoose.Types.ObjectId(requesterId),
        },
      },
    });    

    res.status(200).json({ message: 'Follow request declined.' });
  } catch (error) {
    console.error('Error declining follow request:', error);
    res.status(500).json({ message: 'Server error.', error });
  }
});

// Unfollow
router.delete('/unfollow/:targetUserId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id; // The current user performing the unfollow
    const targetUserId = req.params.targetUserId; // The user being unfollowed

    const user = await User.findById(userId);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ message: 'User to unfollow not found.' });
    }

    const wasFollowing = user.following.includes(targetUserId);
    const wasFollowed = targetUser.followers.includes(userId);

    if (!wasFollowing && !wasFollowed) {
      return res.status(400).json({ message: 'You are not following this user.' });
    }

    // Remove user from targetUser's followers
    targetUser.followers = targetUser.followers.filter(id => id.toString() !== userId);
    // Remove targetUser from user's following
    user.following = user.following.filter(id => id.toString() !== targetUserId);

    await user.save();
    await targetUser.save();

    // Optionally remove any previous follow confirmation notifications
    await User.findByIdAndUpdate(userId, {
      $pull: {
        notifications: {
          type: 'followAccepted',
          relatedId: new mongoose.Types.ObjectId(targetUserId),
        },
      },
    });

    await User.findByIdAndUpdate(targetUserId, {
      $pull: {
        notifications: {
          type: 'followAccepted',
          relatedId: new mongoose.Types.ObjectId(userId),
        },
      },
    });

    res.status(200).json({ message: 'Successfully unfollowed the user.' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ message: 'Server error.', error });
  }
});

// Search Users
router.get('/search', verifyToken, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Search query is required.' });
    }

    // Find matching users excluding the authenticated user
    const users = await User.find({
      $or: [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
      ],
      _id: { $ne: req.user.id },
    }).select('_id firstName lastName profilePic');

    if (!users.length) {
      return res.status(200).json([]); // No matches
    }

    // Map user IDs to enrich with profile pics
    const userIds = users.map((user) => user._id);
    const profilePicMap = await resolveUserProfilePics(userIds);

    const enriched = users.map((user) => {
      const picInfo = profilePicMap[user._id.toString()] || {};
      return {
        ...user.toObject(),
        profilePic: picInfo.profilePic || null,
        presignedProfileUrl: picInfo.profilePicUrl || null,
      };
    });

    console.log(`🔍 Found ${enriched.length} users with profile pics`);
    res.status(200).json(enriched);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/cancel-follow-request', verifyToken, async (req, res) => {
  try {
    const senderId = req.user.id; // The user canceling the follow request
    const { recipientId } = req.body; // The user who was supposed to approve it

    const sender = await User.findById(senderId);
    const recipient = await User.findById(recipientId);

    if (!recipient) {
      return res.status(404).json({ message: 'Recipient user not found.' });
    }

    // Check if a follow request exists
    if (!sender.followRequests?.sent.includes(recipientId)) {
      return res.status(400).json({ message: 'No follow request to cancel.' });
    }

    // Remove the follow request from both users
    sender.followRequests.sent = sender.followRequests.sent.filter(id => id.toString() !== recipientId);
    recipient.followRequests.received = recipient.followRequests.received.filter(id => id.toString() !== senderId);

    await sender.save();
    await recipient.save();

    // Remove follow request notification
    await User.findByIdAndUpdate(recipientId, {
      $pull: {
        notifications: {
          type: 'followRequest',
          relatedId: new mongoose.Types.ObjectId(senderId),
        },
      },
    });

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
    const { targetUserId } = req.params;

    if (followerId === targetUserId) {
      return res.status(400).json({ message: 'Cannot follow yourself.' });
    }

    const follower = await User.findById(followerId);
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) return res.status(404).json({ message: 'Target user not found.' });

    // Enforce only public profiles
    if (targetUser.privacySettings?.profileVisibility === 'private') {
      return res.status(403).json({ message: 'This user requires follow approval.' });
    }

    if (follower.following.includes(targetUserId)) {
      return res.status(400).json({ message: 'Already following this user.' });
    }

    follower.following.push(targetUserId);
    targetUser.followers.push(followerId);

    await follower.save();
    await targetUser.save();

    res.status(200).json({ message: 'Followed successfully.' });
  } catch (err) {
    console.error('Error following user:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// GET followers and following for a user
router.get('/followers-following/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .populate('followers', '_id firstName lastName profilePic')
      .populate('following', '_id firstName lastName profilePic');

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
        presignedProfileUrl: profilePicMap[u._id.toString()]?.profilePicUrl || null,
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
