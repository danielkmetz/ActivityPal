const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const verifyToken = require('../middleware/verifyToken'); // Import your middleware

// Send Friend Request
router.post('/send-friend-request', verifyToken, async (req, res) => {
  try {
    const senderId = req.user.id; // Extracted from the token by verifyToken middleware
    const { recipientId } = req.body; // Recipient's ID from the request body

    // Find sender and recipient
    const sender = await User.findById(senderId);
    const recipient = await User.findById(recipientId);

    if (!recipient) {
      return res.status(404).json({ message: 'Recipient user not found.' });
    }

    if (sender.friends.includes(recipientId)) {
      return res.status(400).json({ message: 'You are already friends with this user.' });
    }

    if (recipient.friendRequests?.received.includes(senderId)) {
      return res.status(400).json({ message: 'Friend request already sent.' });
    }

    // Initialize friendRequests if undefined
    sender.friendRequests = sender.friendRequests || { sent: [], received: [] };
    recipient.friendRequests = recipient.friendRequests || { sent: [], received: [] };

    // Update friend request data
    sender.friendRequests.sent.push(recipientId);
    recipient.friendRequests.received.push(senderId);

    // Save changes
    await sender.save();
    await recipient.save();

    res.status(200).json({ 
      message: 'Friend request sent successfully.',
      recipientId,
      updatedSentRequests: sender.friendRequests.sent, 
    });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ message: 'Server error.', error });
  }
});

// Accept Friend Request
router.post('/accept-friend-request', verifyToken, async (req, res) => {
  try {
    const recipientId = req.user.id; // Current user from the token
    const { senderId } = req.body; // Sender's ID from the request body

    const recipient = await User.findById(recipientId);
    const sender = await User.findById(senderId).select(
      '_id firstName lastName email isBusiness friends profilePic friendRequests'
    ); // Fetch sender details with friendRequests

    // Log to check the state of the users before modifying
    console.log('Recipient:', recipient);
    console.log('Sender:', sender);

    if (!sender) {
      return res.status(404).json({ message: 'Sender user not found.' });
    }

    if (!recipient.friendRequests || !recipient.friendRequests.received) {
      console.error(`Recipient's friendRequests.received is undefined:`, recipient.friendRequests);
      return res.status(400).json({ message: 'Recipient has no friend request data.' });
    }

    if (!sender.friendRequests || !sender.friendRequests.sent) {
      console.error(`Sender's friendRequests.sent is undefined:`, sender.friendRequests);
      return res.status(400).json({ message: 'Sender has no friend request data.' });
    }

    if (!recipient.friendRequests.received.includes(senderId)) {
      return res.status(400).json({ message: 'No friend request from this user.' });
    }

    // Proceed with removing the friend request and updating friends list
    recipient.friendRequests.received = recipient.friendRequests.received.filter(
      id => id.toString() !== senderId
    );

    sender.friendRequests.sent = sender.friendRequests.sent.filter(
      id => id.toString() !== recipientId
    );

    recipient.friends.push(senderId);
    sender.friends.push(recipientId);

    await recipient.save();
    await sender.save();

    // Remove friend request notification
    await User.findByIdAndUpdate(recipientId, {
      $pull: {
        notifications: {
          type: 'friendRequest',
          relatedId: new mongoose.Types.ObjectId(senderId),
        },
      },
    });

    res.status(200).json({
      message: 'Friend request accepted.',
      friend: sender,
    });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ message: 'Server error.', error });
  }
});

// Decline Friend Request
router.post('/decline-friend-request', verifyToken, async (req, res) => {
  try {
    const recipientId = req.user.id; // Current user from the token
    const { senderId } = req.body; // Sender's ID from the request body

    const recipient = await User.findById(recipientId);
    const sender = await User.findById(senderId);

    if (!sender) {
      return res.status(404).json({ message: 'Sender user not found.' });
    }

    if (!recipient.friendRequests?.received.includes(senderId)) {
      return res.status(400).json({ message: 'No friend request from this user.' });
    }

    // Remove from friendRequests
    recipient.friendRequests.received = recipient.friendRequests.received.filter(
      id => id.toString() !== senderId
    );
    sender.friendRequests.sent = sender.friendRequests.sent.filter(
      id => id.toString() !== recipientId
    );

    await recipient.save();
    await sender.save();

    res.status(200).json({ message: 'Friend request declined.' });
  } catch (error) {
    console.error('Error declining friend request:', error);
    res.status(500).json({ message: 'Server error.', error });
  }
});

// Remove Friend
router.delete('/remove-friend/:friendId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id; // Current user from the token
    const friendId = req.params.friendId; // Friend's ID from the route parameter

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!friend) {
      return res.status(404).json({ message: 'Friend user not found.' });
    }

    if (!user.friends.includes(friendId)) {
      return res.status(400).json({ message: 'This user is not your friend.' });
    }

    // Remove from friends list
    user.friends = user.friends.filter(id => id.toString() !== friendId);
    friend.friends = friend.friends.filter(id => id.toString() !== userId);

    await user.save();
    await friend.save();

    // Check for friend request acceptance notification in both users
    await User.findByIdAndUpdate(friend, {
      $pull: {
        notifications: {
          type: 'friendRequestAccepted',
          relatedId: new mongoose.Types.ObjectId(user),
        },
      },
    });

    await User.findByIdAndUpdate(user, {
      $pull: {
        notifications: {
          type: 'friendRequestAccepted',
          relatedId: new mongoose.Types.ObjectId(friend),
        },
      },
    });

    res.status(200).json({ message: 'Friend removed successfully.' });
  } catch (error) {
    console.error('Error removing friend:', error);
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

        const users = await User.find({
            $or: [
                { firstName: { $regex: query, $options: 'i' } },
                { lastName: { $regex: query, $options: 'i' } },
            ],
            _id: { $ne: req.user.id }, // Exclude the authenticated user
        })
        .select('-password -__v'); // Exclude sensitive fields like password and version key

        console.log('Found users:', users);
        res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Cancel Friend Request
router.post('/cancel-friend-request', verifyToken, async (req, res) => {
    try {
      const senderId = req.user.id; // Current user from the token
      const { recipientId } = req.body; // Recipient's ID from the request body
  
      const sender = await User.findById(senderId);
      const recipient = await User.findById(recipientId);
  
      if (!recipient) {
        return res.status(404).json({ message: 'Recipient user not found.' });
      }
  
      // Check if a friend request exists
      if (!sender.friendRequests?.sent.includes(recipientId)) {
        return res.status(400).json({ message: 'No friend request to cancel.' });
      }
  
      // Remove friend request from both users
      sender.friendRequests.sent = sender.friendRequests.sent.filter(id => id.toString() !== recipientId);
      recipient.friendRequests.received = recipient.friendRequests.received.filter(id => id.toString() !== senderId);
  
      await sender.save();
      await recipient.save();

      await User.findByIdAndUpdate(recipientId, {
        $pull: {
            notifications: {
                type: 'friendRequest',
                relatedId: new mongoose.Types.ObjectId(senderId),
            }
        }
      });
  
      res.status(200).json({ message: 'Friend request canceled.' });
    } catch (error) {
      console.error('Error canceling friend request:', error);
      res.status(500).json({ message: 'Server error.' });
    }
});
  

module.exports = router;
