const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { generatePresignedUrl } = require('../helpers/generatePresignedUrl');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const User = require('../models/User'); // Import User model
const router = express.Router();

// Configure multer to use memory storage
const storage = multer.memoryStorage(); // Store file in memory as a buffer
const upload = multer({ storage });

// Utility function: Find a user by userId
const findUser = async (userId) => {
  const user = await User.findById(userId); // Corrected to use userId
  if (!user) {
    throw new Error('User not found.');
  }
  return user;
};

// Endpoint to generate a pre-signed URL for uploading a single profile picture
router.post('/upload-profile-pic/:userId', async (req, res) => {
  const { userId } = req.params;
  const { fileName } = req.body; // Expect a single file name in the request body

  if (!fileName) {
    return res.status(400).json({ message: 'No file name provided.' });
  }

  try {
    const photoKey = `profilePics/${userId}/${uuidv4()}_${fileName}`;
    const presignedUrl = await generatePresignedUrl(photoKey);

    res.status(200).json({ presignedUrl, photoKey });
  } catch (error) {
    console.error('Error generating pre-signed URL:', error);
    res.status(500).json({ message: 'Error generating pre-signed URL.', error });
  }
});

// Endpoint to save metadata for a single profile picture
router.post('/metadata-profile-pic/:userId', async (req, res) => {
  const { userId } = req.params;
  const { photoKey, uploadedBy, description, tags } = req.body; // Metadata for the uploaded photo

  if (!photoKey) {
    return res.status(400).json({ message: 'Photo key is required.' });
  }

  try {
    const user = await findUser(userId);

    // Add metadata for the profile picture
    user.profilePic = {
      photoKey,
      uploadedBy,
      description,
      tags,
    };

    await user.save();

    res.status(200).json({ message: 'Metadata saved successfully.' });
  } catch (error) {
    console.error('Error saving metadata:', error);
    res.status(500).json({ message: 'Error saving metadata.', error });
  }
});

// Endpoint to retrieve a single profile picture and its pre-signed download URL
router.get('/:userId/profile-pic', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await findUser(userId);

    const { photoKey, uploadedBy, description, tags } = user.profilePic || {}; // Expect only one profilePic object
    if (!photoKey) {
      return res.status(404).json({ message: 'Profile picture not found.' });
    }

    const url = await getPresignedUrl(photoKey);

    res.status(200).json({
      photoKey,
      uploadedBy,
      description,
      tags,
      url, // Include pre-signed URL in the response
    });
  } catch (error) {
    console.error('Error fetching photo:', error);
    res.status(500).json({ message: 'Error fetching photo.', error });
  }
});

module.exports = router;
