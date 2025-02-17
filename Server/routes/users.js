const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken'); // Middleware to authenticate the user
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');

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
                user.presignedProfileUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
            }
            return user;
        }));

        res.status(200).json(updatedUsers);
    } catch (error) {
        console.error('Error fetching users by IDs:', error);
        res.status(500).json({ message: 'Server error.', error });
    }
});

module.exports = router;
