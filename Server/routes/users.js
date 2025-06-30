const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken'); // Middleware to authenticate the user
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

// Get user by ID
router.get('/user/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.params.id;

        // Find the user by ID
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Return the user data
        res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        res.status(500).json({ message: 'Server error.', error });
    }
});

// Get users by an array of IDs
router.post('/users/by-ids', verifyToken, async (req, res) => {
    try {
        const { userIds } = req.body;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'User IDs must be a non-empty array.' });
        }

        // Find users whose _id is in the provided array
        const users = await User.find({ _id: { $in: userIds } })
            .select('firstName lastName email isBusiness friends friendRequests profilePic') // Select fields you want
            .lean(); // Convert Mongoose documents to plain JS objects

        // Process each user to generate a presigned URL if they have a profilePic.photoKey
        const updatedUsers = await Promise.all(users.map(async (user) => {
            if (user.profilePic?.photoKey) {
                user.presignedProfileUrl = await getPresignedUrl(user.profilePic.photoKey);
            }
            return user;
        }));

        res.status(200).json(updatedUsers);
    } catch (error) {
        console.error('Error fetching users by IDs:', error);
        res.status(500).json({ message: 'Server error.', error });
    }
});

// GET privacy settings for a user
router.get('/privacy-settings/:userId', verifyToken, async (req, res) => {
    try {
      const { userId } = req.params;
  
      const user = await User.findById(userId).select('privacySettings');
  
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }
  
      return res.status(200).json({ privacySettings: user.privacySettings });
    } catch (error) {
      console.error('Error fetching privacy settings:', error);
      res.status(500).json({ message: 'Server error.' });
    }
});

// UPDATE message permissions for a user
router.put('/message-settings/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { messagePermissions } = req.body;

    const validOptions = ['everyone', 'peopleIFollow'];
    if (!validOptions.includes(messagePermissions)) {
      return res.status(400).json({ message: 'Invalid messagePermissions value.' });
    }

    // Ensure the user is updating their own settings
    if (req.user.id !== userId) {
      return res.status(403).json({ message: 'Unauthorized to update message settings for this user.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { 'privacySettings.messagePermissions': messagePermissions } },
      { new: true, runValidators: true }
    ).select('privacySettings');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({
      message: 'Message settings updated successfully.',
      privacySettings: updatedUser.privacySettings,
    });
  } catch (error) {
    console.error('Error updating message permissions:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// UPDATE any privacy setting field
router.put('/privacy-settings/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Ensure user is modifying their own settings
    if (req.user.id !== userId) {
      return res.status(403).json({ message: 'Unauthorized to update these settings.' });
    }

    // Whitelist of allowed keys and their valid options
    const validFields = {
      profileVisibility: ['public', 'private'],
      invites: ['peopleIFollow', 'everyone', 'none'],
      contentVisibility: ['public', 'friendsOnly'],
      tagPermissions: ['everyone', 'peopleIFollow', 'none'],
      messagePermissions: ['everyone', 'peopleIFollow', 'none'],
    };

    const setObj = {};

    for (const key in updates) {
      const value = updates[key];

      if (!(key in validFields)) {
        return res.status(400).json({ message: `Invalid setting key: ${key}` });
      }

      if (!validFields[key].includes(value)) {
        return res.status(400).json({ message: `Invalid value for ${key}` });
      }

      setObj[`privacySettings.${key}`] = value;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: setObj },
      { new: true, runValidators: true }
    ).select('privacySettings');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      message: 'Privacy settings updated successfully.',
      privacySettings: updatedUser.privacySettings,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// Get user's full name by ID
router.get('/fullname/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('firstName lastName');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const fullName = `${user.firstName} ${user.lastName}`;
    return res.status(200).json({ fullName });
  } catch (error) {
    console.error('Error fetching user full name:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// DELETE user account
router.delete('/user/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Optionally ensure that the requesting user is deleting their own account
    if (req.user.id !== id) {
      return res.status(403).json({ message: 'Unauthorized to delete this account.' });
    }

    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Optionally: perform additional cleanup here if needed
    // e.g., delete associated posts, messages, etc.

    res.status(200).json({ message: 'User account deleted successfully.' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
