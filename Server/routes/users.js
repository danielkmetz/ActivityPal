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

// UPDATE privacy settings for a user
router.put('/privacy-settings/:userId', verifyToken, async (req, res) => {
    try {
      const { userId } = req.params;
      const { profileVisibility } = req.body;
  
      if (!['public', 'private'].includes(profileVisibility)) {
        return res.status(400).json({ message: 'Invalid profile visibility value.' });
      }
  
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { 'privacySettings.profileVisibility': profileVisibility } },
        { new: true, runValidators: true }
      ).select('privacySettings');
  
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found.' });
      }
  
      return res.status(200).json({
        message: 'Privacy settings updated successfully.',
        privacySettings: updatedUser.privacySettings,
      });
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      res.status(500).json({ message: 'Server error.' });
    }
});  

module.exports = router;
