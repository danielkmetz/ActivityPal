const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { uploadToS3 } = require('../helpers/uploadToS3'); // AWS SDK-based upload helper
const { getObjectFromS3 } = require('../helpers/getObjectFromS3');
const { generatePresignedUrl } = require('../helpers/generatePresignedUrl');
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');
const Business = require('../models/Business'); // Import Business model
const User = require('../models/User');
const router = express.Router();

// Utility function: Find a user by userId
const findUser = async (userId) => {
  const user = await User.findById(userId); // Corrected to use userId
  if (!user) {
    throw new Error('User not found.');
  }
  return user;
};

// Configure multer to use memory storage
const storage = multer.memoryStorage(); // Store file in memory as a buffer
const upload = multer({ storage });

// Upload Banner Route
router.post("/upload-business/:placeId", upload.single("banner"), async (req, res) => {
    const { placeId } = req.params;

    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file provided" });
        }

        const business = await Business.findOne({ placeId });
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }

        const key = `banners/${placeId}/${Date.now()}-${req.file.originalname}`;
        const objectKey = await uploadToS3(req.file, key);

        business.bannerKey = objectKey;
        await business.save();

        res.status(200).json({ message: "Banner uploaded successfully", objectKey });
    } catch (error) {
        console.error("Error uploading banner:", error);
        res.status(500).json({ message: "Error uploading banner", error: error.message });
    }
});

// Endpoint to generate a pre-signed URL for uploading a single banner
router.post('/upload-user-banner/:userId', async (req, res) => {
    const { userId } = req.params;
    const { fileName } = req.body; // Expect a single file name in the request body
  
    if (!fileName) {
      return res.status(400).json({ message: 'No file name provided.' });
    }
  
    try {
      const photoKey = `banners/${userId}/${uuidv4()}_${fileName}`;
      const presignedUrl = await generatePresignedUrl(photoKey);
  
      res.status(200).json({ presignedUrl, photoKey });
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      res.status(500).json({ message: 'Error generating pre-signed URL.', error });
    }
});

// Endpoint to save metadata for a single profile picture
router.post('/metadata-user-banner/:userId', async (req, res) => {
    const { userId } = req.params;
    const { photoKey, uploadedBy, description, tags } = req.body; // Metadata for the uploaded photo
  
    if (!photoKey) {
      return res.status(400).json({ message: 'Photo key is required.' });
    }
  
    try {
      const user = await findUser(userId);
  
      // Add metadata for the profile picture
      user.banner = {
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

// Endpoint to retrieve a single banner picture and its pre-signed download URL
router.get('/:userId/banner-user', async (req, res) => {
    const { userId } = req.params;
  
    try {
      const user = await findUser(userId);
  
      const { photoKey, uploadedBy, description, tags } = user.banner || {}; // Expect only one profilePic object
      if (!photoKey) {
        return res.status(404).json({ message: 'Banner not found.' });
      }
  
      const url = await generateDownloadPresignedUrl(photoKey);
  
      res.status(200).json({
        photoKey,
        uploadedBy,
        description,
        tags,
        url, // Include pre-signed URL in the response
      });
    } catch (error) {
      console.error('Error fetching banner:', error);
      res.status(500).json({ message: 'Error fetching banner.', error });
    }
});  

// Fetch Banner Route for business
router.get("/:placeId/banner-business", async (req, res) => {
    const { placeId } = req.params;

    try {
        const business = await Business.findOne({ placeId });
        if (!business || !business.bannerKey) {
            return res.status(404).json({ message: "Banner not found" });
        }

        const { body: objectStream, contentType } = await getObjectFromS3(business.bannerKey);

        // Pipe the S3 object stream directly to the client
        res.setHeader("Content-Type", contentType || "application/octet-stream");
        objectStream.pipe(res);
    } catch (error) {
        console.error("Error retrieving banner:", error);
        res.status(500).json({ message: "Error retrieving banner", error: error.message });
    }
});

module.exports = router;
