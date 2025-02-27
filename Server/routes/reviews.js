const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const User = require('../models/User');
const mongoose = require('mongoose');
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');

// Retrieve a review by its reviewId
router.get('/review/:reviewId', async (req, res) => {
  const { reviewId } = req.params;
  console.log(`\n🔍 Fetching review with ID: ${reviewId}`);

  try {
      // Find the business that contains the review
      console.log(`🔎 Searching for business with review ID: ${reviewId}`);
      const business = await Business.findOne({ "reviews._id": reviewId });

      if (!business) {
          console.warn(`⚠️ Business not found for reviewId: ${reviewId}`);
          return res.status(404).json({ message: "Review not found" });
      }

      // Find the specific review
      console.log(`✅ Business found: ${business.businessName}`);
      const review = business.reviews.id(reviewId);

      if (!review) {
          console.warn(`⚠️ Review not found in business: ${business.businessName}`);
          return res.status(404).json({ message: "Review not found" });
      }

      console.log(`📌 Review found: ${review.reviewText}`);

      // Fetch user profile picture
      console.log(`🔍 Fetching user profile picture for user ID: ${review.userId}`);
      const user = await User.findById(review.userId).select("profilePic");

      let profilePic = null;
      let profilePicUrl = null;

      if (user?.profilePic?.photoKey) {
          try {
              profilePic = user.profilePic;
              profilePicUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
              console.log(`✅ Profile picture URL generated: ${profilePicUrl}`);
          } catch (error) {
              console.error(`❌ Error generating presigned URL for profile picture:`, error);
          }
      } else {
          console.log(`⚠️ No profile picture found for user: ${review.userId}`);
      }

      // Format the review response
      const formattedReview = {
          _id: review._id,
          userId: review.userId,
          fullName: review.fullName,
          rating: review.rating,
          reviewText: review.reviewText,
          date: review.date,
          photos: review.photos || [], // Ensure empty array if no photos
          likes: review.likes || [], // Ensure empty array if no likes
          comments: review.comments, // Recursively format comments & replies
          profilePic,
          profilePicUrl, // Presigned URL for profile picture
          businessName: business.businessName,
          placeId: business.placeId,
      };

      console.log(`✅ Successfully retrieved review for business: ${business.businessName}`);
      res.status(200).json(formattedReview);

  } catch (error) {
      console.error(`❌ Error retrieving review:`, error);
      res.status(500).json({ message: "Server error", error: error.message });
  }
});

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

      // Find if the user has already liked the review
      const likeIndex = review.likes.findIndex((like) => like.userId === userId);
      const reviewOwnerId = review.userId; // Owner of the review

      if (likeIndex > -1) {
          // ✅ User already liked → Unlike the review
          review.likes.splice(likeIndex, 1);
          await business.save();

          // ✅ Remove the like notification from the review owner's notifications list
          await User.findByIdAndUpdate(reviewOwnerId, {
            $pull: { 
                notifications: { 
                    type: 'like', 
                    relatedId: new mongoose.Types.ObjectId(reviewId) // 🔥 Ensure proper ObjectId comparison
                } 
            }
          }, { new: true });

          return res.status(200).json({ message: 'Like removed', likes: review.likes });
      } else {
          // ✅ User has not liked → Like the review
          review.likes.push({ userId, fullName, date: new Date() });
          await business.save();

          return res.status(200).json({ message: 'Like added', likes: review.likes });
      }
  } catch (error) {
      console.error("Error toggling like:", error);
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

      // Create a new comment object
      const newComment = { userId, commentText, fullName };

      // Add the new comment and get its reference
      const addedComment = review.comments.create(newComment);
      review.comments.push(addedComment);

      await business.save();

      res.status(201).json({ 
          message: 'Comment added successfully', 
          comment: addedComment // Returning the newly created comment
      });
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

      // Recursive function to find a comment or reply by ID
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

      // Find the parent comment or reply
      const target = findCommentOrReply(review.comments, commentId);
      if (!target) {
          return res.status(404).json({ message: 'Comment or reply not found' });
      }

      // Create a new reply with Mongoose's create() method
      const newReply = {
        _id: new mongoose.Types.ObjectId(), // ✅ Generate a new ObjectId
        userId,
        fullName,
        commentText,
        date: new Date(),
        replies: [], // Initialize empty array for nested replies
      };

      target.replies.push(newReply);

      business.markModified('reviews');
      await business.save();

      res.status(201).json({ 
          message: 'Reply added successfully', 
          reply: newReply, // ✅ Now returning the newly created reply
          parentCommentOwner: target.userId,
      });
  } catch (error) {
      console.error('Error adding reply:', error.message, error.stack);
      res.status(500).json({ message: 'Server error' });
  }
});

// Delete a comment or reply by its ObjectId and remove associated notifications
router.delete('/:placeId/:reviewId/:commentId', async (req, res) => {
  const { placeId, reviewId, commentId } = req.params;
  const { relatedId } = req.body; // UserId to look within notifications

  try {
      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });

      const review = business.reviews.id(reviewId);
      if (!review) return res.status(404).json({ message: 'Review not found' });

      // Recursive function to find and remove a comment or reply
      const removeCommentOrReply = (comments, targetId) => {
          for (let i = 0; i < comments.length; i++) {
              if (comments[i]._id.toString() === targetId) {
                  const commentOwnerId = comments[i].userId; // Get owner of comment/reply
                  comments.splice(i, 1); // Remove the comment/reply
                  
                  // Remove the comment/reply notification from the specified relatedId user's notifications
                  User.findByIdAndUpdate(relatedId, {
                      $pull: { 
                          notifications: { 
                              $or: [
                                  { type: 'reply', replyId: new mongoose.Types.ObjectId(targetId) },
                                  { type: 'comment', commentId: new mongoose.Types.ObjectId(targetId) }
                              ]
                          } 
                      }
                  }, { new: true }).catch(error => console.error("Error removing notification:", error));
                  
                  return true;
              }
              if (comments[i].replies && comments[i].replies.length > 0) {
                  const foundInReplies = removeCommentOrReply(comments[i].replies, targetId);
                  if (foundInReplies) return true;
              }
          }
          return false;
      };

      // Attempt to remove the comment or reply
      const deleted = removeCommentOrReply(review.comments, commentId);
      if (!deleted) return res.status(404).json({ message: 'Comment or reply not found' });

      business.markModified('reviews');
      await business.save();

      res.status(200).json({ message: 'Comment or reply deleted successfully' });
  } catch (error) {
      console.error('Error deleting comment or reply:', error);
      res.status(500).json({ message: 'Server error' });
  }
});

// Edit a comment or reply
router.put('/:placeId/:reviewId/:commentId', async (req, res) => {
  const { placeId, reviewId, commentId } = req.params;
  const { userId, newText } = req.body;

  if (!newText) {
    return res.status(400).json({ message: 'Comment text cannot be empty' });
  }

  try {
      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });

      const review = business.reviews.id(reviewId);
      if (!review) return res.status(404).json({ message: 'Review not found' });

      // Recursive function to find and update a comment or reply
      const updateCommentOrReply = (comments) => {
          for (let comment of comments) {
              if (comment._id.toString() === commentId) {
                  if (comment.userId.toString() !== userId) {
                      return { error: 'Unauthorized' }; // Prevent unauthorized edits
                  }
                  comment.commentText = newText;
                  return { updated: comment };
              }
              if (comment.replies && comment.replies.length > 0) {
                  const nestedUpdate = updateCommentOrReply(comment.replies);
                  if (nestedUpdate) return nestedUpdate;
              }
          }
          return null;
      };

      const result = updateCommentOrReply(review.comments);

      if (!result) {
          return res.status(404).json({ message: 'Comment or reply not found' });
      } else if (result.error) {
          return res.status(403).json({ message: result.error });
      }

      business.markModified('reviews'); // Ensure the update is saved
      await business.save();

      res.status(200).json({ message: 'Comment edited successfully', updatedComment: result.updated });

  } catch (error) {
      console.error('Error editing comment or reply:', error);
      res.status(500).json({ message: 'Server error' });
  }
});
  
module.exports = router;
