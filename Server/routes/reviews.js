const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const User = require('../models/User');
const mongoose = require('mongoose');
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');

router.post('/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const { userId, rating, reviewText, businessName, location, fullName, photos } = req.body; // photos = array of {photoKey, description, tags}
  const date = Date.now();

  try {
      // Check if the business exists in the database
      let business = await Business.findOne({ placeId });

      // If the business does not exist, create a minimal profile
      if (!business) {
          business = new Business({
              placeId,
              businessName: businessName || "Unknown Business",
              location: location || "Unknown Location",
              firstName: "N/A",
              lastName: "N/A",
              email: "N/A",
              password: "N/A",
              events: [],
              reviews: [],
          });
      }

      // Fetch user profile picture
      const user = await User.findById(userId).select("profilePic");
      let profilePic = null;
      let profilePicUrl = null;

      if (user?.profilePic?.photoKey) {
          profilePic = user.profilePic;
          profilePicUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
      }

      // Convert `photos` array into `PhotoSchema` format and generate presigned URLs
      const photoObjects = await Promise.all(
          photos.map(async (photo) => {
              const downloadUrl = await generateDownloadPresignedUrl(photo.photoKey);
              return {
                  photoKey: photo.photoKey,
                  uploadedBy: userId,
                  description: photo.description || null,
                  tags: photo.tags || [],
                  uploadDate: new Date(),
                  url: downloadUrl, // Attach the pre-signed URL for fetching
              };
          })
      );

      // Create a new review object with photos
      const newReview = {
          userId,
          fullName,
          rating,
          reviewText,
          photos: photoObjects, // Attach processed photos with URLs to the review
          date,
      };

      // Add the review to the business's reviews array
      business.reviews.push(newReview);

      // Save the updated business document
      await business.save();

      // Format response
      const reviewResponse = {
          placeId,
          userId,
          fullName,
          rating,
          reviewText,
          businessName,
          profilePic,
          profilePicUrl,
          date,
          photos: photoObjects, // Return saved photos with pre-signed URLs for confirmation
      };

      res.status(201).json({ message: 'Review added successfully', review: reviewResponse });
  } catch (error) {
      console.error('Error adding review:', error);
      res.status(500).json({ message: 'Server error' });
  }
});

// Delete a review by its ObjectId
router.delete('/:placeId/:reviewId', async (req, res) => {
  const { placeId, reviewId } = req.params;

  try {
    // Find the business by placeId
    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    // Find and remove the review by its ObjectId
    const reviewIndex = business.reviews.findIndex(
      (review) => review._id.toString() === reviewId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({ message: 'Review not found' });
    }

    business.reviews.splice(reviewIndex, 1);

    // Save the updated business document
    await business.save();

    res.status(200).json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Retrieve reviews by user ID
router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params;
  
    try {
      // Find businesses with reviews by the user
      const businesses = await Business.find({ 'reviews.userId': userId });
  
      // Extract reviews and add the business name to each review
      const userReviews = businesses.flatMap((business) =>
        business.reviews
          .filter((review) => review.userId === userId)
          .map((review) => ({
            ...review.toObject(), // Convert Mongoose document to plain object
            businessName: business.businessName, // Add business name
            placeId: business.placeId,
          }))
      );
  
      res.status(200).json({ reviews: userReviews });
    } catch (error) {
      console.error('Error retrieving reviews by user email:', error);
      res.status(500).json({ message: 'Server error' });
    }
});
    
// Retrieve reviews by placeId
router.get('/:placeId', async (req, res) => {
    const { placeId } = req.params;
  
    try {
      const business = await Business.findOne({ placeId });
  
      if (!business) {
        return res.status(404).json({ message: 'Business not found' });
      }
  
      res.status(200).json({ reviews: business.reviews });
    } catch (error) {
      console.error('Error retrieving reviews by placeId:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

// Toggle like on a review
router.post('/:placeId/:reviewId/like', async (req, res) => {
    const { placeId, reviewId } = req.params;
    const { userId, fullName } = req.body;
  
    try {
      const business = await Business.findOne({ placeId });
      if (!business) {
        return res.status(404).json({ message: 'Business not found' });
      }
  
      const review = business.reviews.id(reviewId);
      if (!review) {
        return res.status(404).json({ message: 'Review not found' });
      }
  
      // Check if the user has already liked the review
      const likeIndex = review.likes.findIndex((like) => like.userId === userId);
  
      if (likeIndex > -1) {
        // User has already liked the review, so remove the like
        review.likes.splice(likeIndex, 1);
      } else {
        // Add the like
        review.likes.push({ userId, fullName });
      }
  
      await business.save();

      res.status(200).json({ message: 'Like toggled successfully', likes: review.likes });
    } catch (error) {
      console.error('Error toggling like:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

// Add a comment to a review
router.post('/:placeId/:reviewId/comment', async (req, res) => {
    const { placeId, reviewId } = req.params;
    const { userId, commentText, fullName } = req.body;
  
    try {
      const business = await Business.findOne({ placeId });
      if (!business) {
        return res.status(404).json({ message: 'Business not found' });
      }
  
      const review = business.reviews.id(reviewId);
      if (!review) {
        return res.status(404).json({ message: 'Review not found' });
      }
  
      // Add the new comment
      review.comments.push({ userId, commentText, fullName });
  
      await business.save();
  
      res.status(201).json({ message: 'Comment added successfully', comments: review.comments });
    } catch (error) {
      console.error('Error adding comment:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

router.post('/:placeId/:reviewId/:commentId/reply', async (req, res) => {
    const { placeId, reviewId, commentId } = req.params;
    const { userId, fullName, commentText } = req.body;

    try {
        const business = await Business.findOne({ placeId });
        if (!business) return res.status(404).json({ message: 'Business not found' });

        const review = business.reviews.id(reviewId);
        if (!review) return res.status(404).json({ message: 'Review not found' });

        const findCommentOrReply = (comments = [], targetId) => {
            for (const comment of comments) {
                if (comment._id.toString() === targetId) return comment;
                if (comment.replies && comment.replies.length > 0) {
                    const nestedReply = findCommentOrReply(comment.replies, targetId);
                    if (nestedReply) return nestedReply;
                }
            }
            return null;
        };

        const target = findCommentOrReply(review.comments, commentId);
        if (!target) {
            console.error('Target not found for ID:', commentId);
            return res.status(404).json({ message: 'Comment or reply not found' });
        }

        const newReply = {
            userId,
            fullName,
            commentText,
            replies: [], // Initialize empty array for nested replies
        };

        target.replies.push(newReply);

        console.log('New Reply Added:', JSON.stringify(newReply, null, 2));

        business.markModified('reviews');
        await business.save();

        console.log('Successfully saved business document');
        res.status(201).json({ message: 'Reply added successfully', replies: target.replies });
    } catch (error) {
        console.error('Error adding reply:', error.message, error.stack);
        res.status(500).json({ message: 'Server error' });
    }
});

  
module.exports = router;
