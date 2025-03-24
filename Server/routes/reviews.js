const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const User = require('../models/User');
const mongoose = require('mongoose');
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');

// Retrieve a review by its reviewId
router.get('/:postType/:postId', async (req, res) => {
  const { postType, postId } = req.params;

  try {
    let post = null;
    let profilePicUrl = null;
    let business = null;
    let user = null;
    let taggedUsers = [];

    if (postType === 'review') {
      business = await Business.findOne({ "reviews._id": postId });
      if (!business) return res.status(404).json({ message: "Review not found" });

      post = business.reviews.id(postId);
      if (!post) return res.status(404).json({ message: "Review not found" });

      // Fetch full details of tagged users
      if (post.taggedUsers && post.taggedUsers.length > 0) {
        taggedUsers = await User.find(
          { _id: { $in: post.taggedUsers } },
          { firstName: 1, lastName: 1 }
        ).lean();

        taggedUsers = taggedUsers.map(user => ({
          userId: user._id,
          fullName: `${user.firstName} ${user.lastName}`,
        }));
      }
    }
    else if (postType === 'check-in') {
      user = await User.findOne({ "checkIns._id": postId });
      if (!user) return res.status(404).json({ message: "Check-in not found" });

      post = user.checkIns.id(postId);
      if (!post) return res.status(404).json({ message: "Check-in not found" });

      // Fetch business if placeId exists
      if (post.placeId) {
        business = await Business.findOne({ placeId: post.placeId }).lean();
      }

      // Fetch tagged users with full names
      if (post.taggedUsers && post.taggedUsers.length > 0) {
        taggedUsers = await User.find(
          { _id: { $in: post.taggedUsers } },
          { firstName: 1, lastName: 1 }
        ).lean();

        taggedUsers = taggedUsers.map(user => ({
          userId: user._id,
          fullName: `${user.firstName} ${user.lastName}`,
        }));
      }
    }
    else {
      return res.status(400).json({ message: "Invalid post type" });
    }

    // Fetch user details for the post creator
    const postUser = await User.findById(post.userId).select("profilePic firstName lastName").lean();

    if (postUser?.profilePic?.photoKey) {
      profilePicUrl = await generateDownloadPresignedUrl(postUser.profilePic.photoKey);
    }

    // ✅ Process photos: Generate pre-signed URLs & map tagged users in each photo
    let photosWithUrls = [];
    if (post.photos && Array.isArray(post.photos)) {
      photosWithUrls = await Promise.all(
        post.photos.map(async (photo) => {
          const photoTaggedUsers = await User.find(
            { _id: { $in: photo.taggedUsers.map(tag => tag.userId) } },
            { firstName: 1, lastName: 1 }
          ).lean();

          return {
            _id: photo._id,
            photoKey: photo.photoKey,
            uploadedBy: photo.uploadedBy,
            description: photo.description || null,
            uploadDate: photo.uploadDate,
            url: await generateDownloadPresignedUrl(photo.photoKey),
            taggedUsers: photoTaggedUsers.map(user => ({
              userId: user._id,
              fullName: `${user.firstName} ${user.lastName}`,
              x: photo.taggedUsers.find(tag => tag.userId.toString() === user._id.toString())?.x,
              y: photo.taggedUsers.find(tag => tag.userId.toString() === user._id.toString())?.y,
            }))
          };
        })
      );
    }

    // ✅ Construct response object
    const formattedPost = {
      _id: post._id,
      userId: post.userId,
      fullName: post.fullName || `${postUser?.firstName || ''} ${postUser?.lastName || ''}`.trim(),
      rating: postType === 'review' ? post.rating : null,
      reviewText: postType === 'review' ? post.reviewText : null,
      message: postType === 'check-in' ? post.message : null,
      date: post.timestamp || post.date,
      photos: photosWithUrls,  // ✅ Updated photos array with pre-signed URLs & tagged users
      likes: post.likes || [],
      comments: post.comments || [],
      profilePicUrl,
      businessName: business ? business.businessName : null,
      placeId: post.placeId || null,
      taggedUsers,
      type: postType,
    };

    res.status(200).json(formattedPost);
  } catch (error) {
    console.error("❌ Error Fetching Post:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.post("/:placeId", async (req, res) => {
  const { placeId } = req.params;
  const { userId, rating, reviewText, businessName, location, fullName, photos, taggedUsers } = req.body;
  const date = Date.now();

  try {
    // Check if the business exists
    let business = await Business.findOne({ placeId });

    // If business does not exist, create a minimal profile
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
    let profilePicUrl = null;
    if (user?.profilePic?.photoKey) {
      profilePicUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
    }

    // Convert `photos` array into `PhotoSchema` format and generate presigned URLs
    const photoObjects = await Promise.all(
      photos.map(async (photo) => {
        const downloadUrl = await generateDownloadPresignedUrl(photo.photoKey);

        // Ensure tagged users contain userId, x, and y
        const formattedTaggedUsers = photo.taggedUsers.map(tag => ({
          userId: tag.userId,  // ObjectId of the user
          x: tag.x,            // X coordinate
          y: tag.y             // Y coordinate
        }));

        return {
          photoKey: photo.photoKey,
          uploadedBy: userId,
          description: photo.description || null,
          taggedUsers: formattedTaggedUsers, // Store tagged users with coordinates
          uploadDate: new Date(),
          url: downloadUrl,
        };
      })
    );

    // Fetch user details for tagged users in the review
    const taggedUserDetails = await User.find(
      { _id: { $in: taggedUsers } },
      { firstName: 1, lastName: 1 }
    );

    // Convert tagged users to ObjectId array for storage
    const taggedUserIds = taggedUserDetails.map(user => user._id);

    // Create a new review object with photos
    const newReview = {
      userId,
      fullName,
      rating,
      reviewText,
      taggedUsers: taggedUserIds, // Store only Object IDs
      photos: photoObjects, // Attach processed photos with tagged users
      date,
    };

    business.reviews.push(newReview);
    const savedBusiness = await business.save(); // Save the business

    // ✅ Find the newly created review from the saved document
    const createdReview = savedBusiness.reviews[savedBusiness.reviews.length - 1];

    // Populate tagged users in the response (Only for frontend display)
    const populatedTaggedUsers = taggedUserDetails.map(user => ({
      userId: user._id,
      fullName: `${user.firstName} ${user.lastName}`,
    }));

    // Fetch full names for tagged users inside each photo for the response
    const populatedPhotoObjects = await Promise.all(
      photoObjects.map(async (photo) => {
        const photoTaggedUserDetails = await User.find(
          { _id: { $in: photo.taggedUsers.map(tag => tag.userId) } },
          { firstName: 1, lastName: 1 }
        );

        return {
          ...photo,
          taggedUsers: photoTaggedUserDetails.map(user => ({
            userId: user._id,
            fullName: `${user.firstName} ${user.lastName}`,
            x: photo.taggedUsers.find(tag => tag.userId.toString() === user._id.toString())?.x,
            y: photo.taggedUsers.find(tag => tag.userId.toString() === user._id.toString())?.y,
          })), // Full names with x, y coordinates in response
        };
      })
    );

    // Format response
    const reviewResponse = {
      _id: createdReview._id,
      placeId,
      userId,
      fullName,
      rating,
      reviewText,
      businessName,
      profilePicUrl,
      taggedUsers: populatedTaggedUsers, // Full names for frontend
      date,
      photos: populatedPhotoObjects, // Photos with tagged users' full names and coordinates
      type: "review",
    };

    res.status(201).json({ message: "Review added successfully", review: reviewResponse });
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(500).json({ message: "Server error" });
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

router.get('/:placeId', async (req, res) => {
  const { placeId } = req.params;

  try {
    const business = await Business.findOne({ placeId });

    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    const reviews = business.reviews;

    // Fetch users' profile pictures in a single query
    const userIds = reviews.map(review => review.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('profilePic');

    // Create a map for quick lookup of users' profile pictures
    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user.profilePic?.photoKey || null;
      return acc;
    }, {});

    // Process each review to include profile picture URL and review photos' URLs
    const updatedReviews = await Promise.all(
      reviews.map(async (review) => {
        const photoKey = userMap[review.userId.toString()];
        let profilePicUrl = null;

        if (photoKey) {
          profilePicUrl = await generateDownloadPresignedUrl(photoKey);
        }

        // Process review photos (each review has an array of photo objects with a `photoKey`)
        let reviewPhotos = [];
        if (Array.isArray(review.photos) && review.photos.length > 0) {
          reviewPhotos = await Promise.all(
            review.photos.map(async (photo) => {
              const photoUrl = await generateDownloadPresignedUrl(photo.photoKey);
              return {
                ...photo.toObject(), // Keep original photo object structure
                photoUrl,
              };
            })
          );
        }

        return {
          ...review.toObject(), // Ensure review is a plain object
          profilePicUrl,
          photos: reviewPhotos, // Include processed review photos with URLs
        };
      })
    );

    res.status(200).json({ reviews: updatedReviews });
  } catch (error) {
    console.error('Error retrieving reviews with profile and review photos:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle like on a review
router.post('/:postType/:placeId/:postId/like', async (req, res) => {
  const { postType, placeId, postId } = req.params;
  const { userId, fullName } = req.body;

  try {
    let postCollection, post, ownerId;

    if (postType === 'review') {
      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });

      postCollection = business.reviews;
      post = postCollection.id(postId);
      ownerId = post?.userId;

      if (!post) return res.status(404).json({ message: 'Review not found' });

    } else if (postType === 'check-in' || postType === 'checkin') {
      const user = await User.findOne({ 'checkIns._id': postId });
      if (!user) return res.status(404).json({ message: 'Check-in not found' });

      postCollection = user.checkIns;
      post = postCollection.id(postId);
      ownerId = post?.userId;

      if (!post) return res.status(404).json({ message: 'Check-in not found' });

    } else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    // Handle like/unlike logic
    const likeIndex = post.likes.findIndex(like => like.userId === userId);
    const isLiking = likeIndex === -1;

    if (isLiking) {
      post.likes.push({ userId, fullName, date: new Date() });
    } else {
      post.likes.splice(likeIndex, 1);
    }

    await (postType === 'review' ? Business : User).updateOne(
      { [postType === 'review' ? 'placeId' : '_id']: postType === 'review' ? placeId : ownerId },
      { $set: { [postType === 'review' ? 'reviews' : 'checkIns']: postCollection } }
    );

    // Handle notification removal if unliking
    if (!isLiking) {
      await User.findByIdAndUpdate(ownerId, {
        $pull: { notifications: { type: 'like', targetId: postId } },
      });
    }

    return res.status(200).json({ message: isLiking ? 'Like added' : 'Like removed', likes: post.likes });
    
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a comment to a review
router.post('/:postType/:placeId/:reviewId/comment', async (req, res) => {
  const { postType, placeId, reviewId } = req.params;
  const { userId, commentText, fullName } = req.body;

  try {
    let savedComment = null;

    if (postType === 'review') {
      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });

      const review = business.reviews.id(reviewId);
      if (!review) return res.status(404).json({ message: 'Review not found' });

      // ✅ Create a new comment object and use Mongoose's `.create()`
      const newComment = review.comments.create({ userId, commentText, fullName });
      review.comments.push(newComment);
      await business.save();

      savedComment = newComment; // ✅ Ensure we return the newly created comment with _id
    }

    else if (postType === 'check-in') {
      const user = await User.findOne({ 'checkIns._id': reviewId });
      if (!user) return res.status(404).json({ message: 'Check-in post not found' });

      const checkInPost = user.checkIns.id(reviewId);
      if (!checkInPost) return res.status(404).json({ message: 'Check-in post not found' });

      // ✅ Create a new comment object and use Mongoose's `.create()`
      const newComment = checkInPost.comments.create({ userId, commentText, fullName });
      checkInPost.comments.push(newComment);
      await user.save();

      savedComment = newComment; // ✅ Ensure we return the newly created comment with _id
    }

    if (!savedComment) return res.status(500).json({ message: 'Error saving comment' });

    return res.status(201).json({
      message: `Comment added to ${postType} successfully`,
      comment: savedComment, // ✅ Now includes _id
    });

  } catch (error) {
    console.error('🚨 Error adding comment:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Add a reply to a comment
router.post('/:postType/:placeId/:postId/:commentId/reply', async (req, res) => {
  const { postType, placeId, postId, commentId } = req.params;
  const { userId, fullName, commentText } = req.body;

  try {
    let target = null;
    let parentCommentOwner = null;
    let docToSave = null;
    let business = null; // ✅ Declare outside the block
    let user = null; // ✅ Declare outside the block

    // Recursive function to find a comment or reply by ID
    const findCommentOrReply = (comments = [], targetId) => {
      for (const comment of comments) {
        if (comment._id.toString() === targetId) return comment;
        if (comment.replies?.length > 0) {
          const nestedReply = findCommentOrReply(comment.replies, targetId);
          if (nestedReply) return nestedReply;
        }
      }
      return null;
    };

    if (postType === 'review') {
      business = await Business.findOne({ placeId }); // ✅ Assign to the declared variable
      if (!business) return res.status(404).json({ message: 'Business not found' });

      const review = business.reviews.id(postId);
      if (!review) return res.status(404).json({ message: 'Review not found' });

      target = findCommentOrReply(review.comments, commentId);
      if (!target) return res.status(404).json({ message: 'Comment or reply not found' });

      parentCommentOwner = target.userId;
      docToSave = business;
    }
    else if (postType === 'check-in') {
      user = await User.findOne({ 'checkIns._id': postId }); // ✅ Assign to the declared variable
      if (!user) return res.status(404).json({ message: 'Check-in post not found' });

      const checkInPost = user.checkIns.id(postId);
      if (!checkInPost) return res.status(404).json({ message: 'Check-in post not found' });

      target = findCommentOrReply(checkInPost.comments, commentId);
      if (!target) return res.status(404).json({ message: 'Comment or reply not found' });

      parentCommentOwner = target.userId;
      docToSave = user;
    }
    else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    if (!target) {
      return res.status(404).json({ message: 'Target comment/reply not found' });
    }

    // Create a new reply object
    const newReply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      replies: [],
    };

    target.replies.push(newReply);

    // ✅ Use business or user correctly since they are now in scope
    if (postType === 'review' && business) {
      business.markModified('reviews');
    } else if (postType === 'check-in' && user) {
      user.markModified('checkIns');
    }

    await docToSave.save();

    res.status(201).json({
      message: `Reply added to ${postType} successfully`,
      reply: newReply,
      parentCommentOwner,
    });

  } catch (error) {
    console.error('🚨 Error adding reply:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a comment or reply by its ObjectId and remove associated notifications
router.delete('/:postType/:placeId/:postId/:commentId', async (req, res) => {
  const { postType, placeId, postId, commentId } = req.params;
  const { relatedId } = req.body; // UserId to look within notifications

  try {
    let targetComments = null;
    let docToSave = null;

    // Recursive function to find and remove a comment or reply
    const removeCommentOrReply = (comments, targetId) => {
      for (let i = 0; i < comments.length; i++) {
        if (comments[i]._id.toString() === targetId) {
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
        if (comments[i].replies?.length > 0) {
          const foundInReplies = removeCommentOrReply(comments[i].replies, targetId);
          if (foundInReplies) return true;
        }
      }
      return false;
    };

    if (postType === 'review') {
      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });

      const review = business.reviews.id(postId);
      if (!review) return res.status(404).json({ message: 'Review not found' });

      targetComments = review.comments;
      docToSave = business;
    }
    else if (postType === 'check-in') {
      const user = await User.findOne({ 'checkIns._id': postId });
      if (!user) return res.status(404).json({ message: 'Check-in post not found' });

      const checkInPost = user.checkIns.id(postId);
      if (!checkInPost) return res.status(404).json({ message: 'Check-in post not found' });

      targetComments = checkInPost.comments;
      docToSave = user;
    }
    else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    // Ensure we have valid comments to process
    if (!targetComments) {
      return res.status(404).json({ message: 'No comments found in the post' });
    }

    // Attempt to remove the comment or reply
    const deleted = removeCommentOrReply(targetComments, commentId);
    if (!deleted) return res.status(404).json({ message: 'Comment or reply not found' });

    await docToSave.save();

    res.status(200).json({ message: `Comment or reply deleted from ${postType} successfully` });

  } catch (error) {
    console.error('🚨 Error deleting comment or reply:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit a comment or reply
router.put('/:postType/:placeId/:postId/:commentId', async (req, res) => {
  const { postType, placeId, postId, commentId } = req.params;
  const { userId, newText } = req.body;

  if (!newText) {
    return res.status(400).json({ message: 'Comment text cannot be empty' });
  }

  try {
    let targetComments = null;
    let docToSave = null;

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
        if (comment.replies?.length > 0) {
          const nestedUpdate = updateCommentOrReply(comment.replies);
          if (nestedUpdate) return nestedUpdate;
        }
      }
      return null;
    };

    if (postType === 'review') {
      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });

      const review = business.reviews.id(postId);
      if (!review) return res.status(404).json({ message: 'Review not found' });

      targetComments = review.comments;
      docToSave = business;
    }
    else if (postType === 'check-in') {
      const user = await User.findOne({ 'checkIns._id': postId });
      if (!user) return res.status(404).json({ message: 'Check-in post not found' });

      const checkInPost = user.checkIns.id(postId);
      if (!checkInPost) return res.status(404).json({ message: 'Check-in post not found' });

      targetComments = checkInPost.comments;
      docToSave = user;
    }
    else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    if (!targetComments) {
      return res.status(404).json({ message: 'No comments found in the post' });
    }

    const result = updateCommentOrReply(targetComments);

    if (!result) {
      return res.status(404).json({ message: 'Comment or reply not found' });
    } else if (result.error) {
      return res.status(403).json({ message: result.error });
    }

    if (postType === 'review') {
      docToSave.markModified('reviews');
    } else if (postType === 'check-in') {
      docToSave.markModified('checkIns');
    }

    await docToSave.save();

    res.status(200).json({ message: 'Comment edited successfully', updatedComment: result.updated });

  } catch (error) {
    console.error('🚨 Error editing comment or reply:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
