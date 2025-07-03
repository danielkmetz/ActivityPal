const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Business = require('../models/Business'); // Path to your Business model
const { generatePresignedUrl } = require('../helpers/generatePresignedUrl');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const router = express.Router();

// Utility function: Find a business by placeId
const findBusiness = async (placeId) => {
    const business = await Business.findOne({ placeId });
    if (!business) {
      throw new Error('Business not found.');
    }
    return business;
};

// Endpoint to generate pre-signed URLs
router.post('/upload/:placeId', async (req, res) => {
    const { placeId } = req.params;
    const { files } = req.body;
  
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files provided.' });
    }
  
    try {
      const presignedUrls = await Promise.all(
        files.map(async (file) => {
          const photoKey = `photos/${placeId}/${uuidv4()}_${file.name}`;
          const url = await generatePresignedUrl(photoKey);
          return { url, photoKey };
        })
      );
  
      res.status(200).json({ presignedUrls });
    } catch (error) {
      console.error('Error generating pre-signed URLs:', error);
      res.status(500).json({ message: 'Error generating pre-signed URLs.', error });
    }
});

router.post('/metadata/:placeId', async (req, res) => {
    const { placeId } = req.params;
    const photos = req.body; // Metadata for uploaded photos

    try {
      const business = await findBusiness(placeId);
  
      photos.forEach((photo) => {
        business.photos.push(photo);
      });
  
      await business.save();
  
      res.status(200).json({ message: 'Metadata saved successfully.' });
    } catch (error) {
      console.error('Error saving metadata:', error);
      res.status(500).json({ message: 'Error saving metadata.', error });
    }
});  

router.get('/:placeId/all', async (req, res) => {
    const { placeId } = req.params;
  
    try {
      const business = await findBusiness(placeId);
  
      const photos = await Promise.all(
        business.photos.map(async (photo) => {
          try {
            const url = await getPresignedUrl(photo.photoKey);
  
            return {
              photoKey: photo.photoKey,
              uploadedBy: photo.uploadedBy,
              description: photo.description,
              tags: photo.tags,
              url, // Include pre-signed URL in the response
            };
          } catch (error) {
            console.error(`Error generating URL for ${photo.photoKey}:`, error);
            return { photoKey: photo.photoKey, error: 'Failed to generate URL' };
          }
        })
      );
  
      res.status(200).json({ photos });
    } catch (error) {
      console.error('Error fetching photos:', error);
      res.status(500).json({ message: 'Error fetching photos.', error });
    }
});

router.post('/photos/get-urls', async (req, res) => {
  const { photoKeys } = req.body; // Expect an array of photoKeys

  if (!photoKeys || !Array.isArray(photoKeys) || photoKeys.length === 0) {
      return res.status(400).json({ message: 'No photo keys provided.' });
  }

  try {
      // Generate presigned URLs for each photoKey
      const presignedUrls = await Promise.all(
          photoKeys.map(async (photoKey) => {
              try {
                  const url = await getPresignedUrl(photoKey);
                  return { photoKey, url };
              } catch (error) {
                  console.error(`Error generating URL for ${photoKey}:`, error);
                  return { photoKey, error: 'Failed to generate URL' };
              }
          })
      );

      res.status(200).json({ presignedUrls });
  } catch (error) {
      console.error('Error generating presigned URLs:', error);
      res.status(500).json({ message: 'Error generating presigned URLs.', error });
  }
});
  
// Endpoint: Delete a Photo
router.delete('/:placeId/:photoKey', async (req, res) => {
  const { placeId, photoKey } = req.params;

  try {
    const business = await findBusiness(placeId);

    const photoIndex = business.photos.findIndex((photo) => photo.photoKey === photoKey);

    if (photoIndex === -1) {
      return res.status(404).json({ message: 'Photo not found.' });
    }

    // Delete photo from S3 using the helper function
    await s3
      .deleteObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: photoKey,
      })
      .promise();

    // Remove photo from database
    business.photos.splice(photoIndex, 1);
    await business.save();

    res.status(200).json({ message: 'Photo deleted successfully.' });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ message: 'Error deleting photo.', error });
  }
});

module.exports = router;