const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const User = require('../models/User');
const ActivityInvite = require('../models/ActivityInvites.js');
const mongoose = require('mongoose');
const { handleNotification } = require('../utils/notificationHandler.js');
const { resolveTaggedPhotoUsers, resolveTaggedUsers, resolveUserProfilePics } = require('../utils/userPosts.js')
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

// Retrieve a review by its reviewId
router.get('/:postType/:postId', async (req, res) => {
  const { postType, postId } = req.params;

  try {
    let post = null;
    let profilePicUrl = null;
    let business = null;
    let user = null;
    let sender = null;
    let taggedUsers = [];
    let photosWithUrls = [];

    if (postType === 'review') {
      business = await Business.findOne({ "reviews._id": postId });
      if (!business) return res.status(404).json({ message: "Review not found" });

      post = business.reviews.id(postId);
      if (!post) return res.status(404).json({ message: "Review not found" });

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

      const postUser = await User.findById(post.userId).select("profilePic firstName lastName").lean();
      if (postUser?.profilePic?.photoKey) {
        profilePicUrl = await getPresignedUrl(postUser.profilePic.photoKey);
      }

    } else if (postType === 'check-in') {
      user = await User.findOne({ "checkIns._id": postId });
      if (!user) return res.status(404).json({ message: "Check-in not found" });

      post = user.checkIns.id(postId);
      if (!post) return res.status(404).json({ message: "Check-in not found" });

      if (post.placeId) {
        business = await Business.findOne({ placeId: post.placeId }).lean();
      }

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

      const postUser = await User.findById(post.userId).select("profilePic firstName lastName").lean();
      if (postUser?.profilePic?.photoKey) {
        profilePicUrl = await getPresignedUrl(postUser.profilePic.photoKey);
      }

    } else if (postType === 'invite') {
      post = await ActivityInvite.findById(postId).lean();
      if (!post) return res.status(404).json({ message: "Invite not found" });

      sender = await User.findById(post.senderId).select('firstName lastName profilePic').lean();
      if (sender?.profilePic?.photoKey) {
        profilePicUrl = await getPresignedUrl(sender.profilePic.photoKey);
      }

      business = await Business.findOne({ placeId: post.placeId }).lean();
    } else {
      return res.status(400).json({ message: "Invalid post type" });
    }

    if ((postType === 'review' || postType === 'check-in') && Array.isArray(post.photos)) {
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
            url: await getPresignedUrl(photo.photoKey),
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

    const formattedPost = {
      _id: post._id,
      userId: postType === 'invite' ? post.senderId : post.userId,
      fullName:
        postType === 'invite'
          ? `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim()
          : post.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
      rating: postType === 'review' ? post.rating : null,
      priceRating: postType === 'review' ? post.priceRating : null,
      atmosphereRating: postType === 'review' ? post.atmosphereRating : null,
      serviceRating: postType === 'review' ? post.serviceRating : null,
      wouldRecommend: postType === 'review' ? post.wouldRecommend : null,
      reviewText: postType === 'review' ? post.reviewText : null,
      message: postType === 'invite' ? post.message : postType === 'check-in' ? post.message : null,
      date: post.timestamp || post.date || post.dateTime,
      photos: photosWithUrls,
      likes: post.likes || [],
      comments: post.comments || [],
      profilePicUrl,
      businessName: business?.businessName || null,
      placeId: post.placeId || business?.placeId || null,
      recipients: postType === 'invite' ? post.recipients : undefined,
      requests: postType === 'invite' ? post.requests || [] : undefined,
      note: postType === 'invite' ? post.note : undefined,
      isPublic: postType === 'invite' ? post.isPublic : undefined,
      taggedUsers: taggedUsers.length > 0 ? taggedUsers : [],
      type: postType,
    };

    res.status(200).json(formattedPost);
  } catch (error) {
    console.error("❌ Error Fetching Post:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

//Create a new review
router.post("/:placeId", async (req, res) => {
  const { placeId } = req.params;
  const {
    userId,
    rating,
    priceRating,
    atmosphereRating,
    serviceRating,
    wouldRecommend,
    reviewText,
    businessName,
    location,
    fullName,
    photos,
    taggedUsers,
  } = req.body;
  const date = Date.now();

  try {
    // 🔍 Ensure business exists or create minimal one
    let business = await Business.findOne({ placeId });
    if (!business) {
      business = new Business({
        placeId,
        businessName: businessName || "Unknown Business",
        location: {
          type: "Point",
          coordinates: [0, 0], // fallback coords
          formattedAddress: location?.formattedAddress || "Unknown Address",
        },
        firstName: "N/A",
        lastName: "N/A",
        email: "N/A",
        password: "N/A",
        events: [],
        reviews: [],
      });
    }

    // 🔧 Format photos for DB (leave out URL for now — handled in helper later)
    const photoObjects = await Promise.all(
      photos.map(async (photo) => {
        const formattedTagged = Array.isArray(photo.taggedUsers)
          ? photo.taggedUsers.map(tag => ({
            userId: tag.userId,
            x: tag.x,
            y: tag.y,
          }))
          : [];

        return {
          photoKey: photo.photoKey,
          uploadedBy: userId,
          description: photo.description || null,
          taggedUsers: formattedTagged,
          uploadDate: new Date(),
        };
      })
    );

    // ✅ Safely extract tagged user IDs (from object or raw ID)
    const taggedUserIds = (taggedUsers || []).map(t =>
      typeof t === "object" && t !== null ? t.userId || t._id : t
    ).filter(Boolean);

    // 🔨 Create the review (to be stored in DB)
    const newReview = {
      userId,
      fullName,
      rating,
      priceRating,
      serviceRating,
      atmosphereRating,
      wouldRecommend,
      reviewText,
      taggedUsers: taggedUserIds,
      photos: photoObjects,
      date,
    };

    // 📦 Push the review into the business record
    business.reviews.push(newReview);
    const savedBusiness = await business.save();

    // ✅ Get the just-created review
    const createdReview = savedBusiness.reviews[savedBusiness.reviews.length - 1];

    // ✅ Use helper functions to format response data
    const [populatedTaggedUsers, populatedPhotos, profileMap] = await Promise.all([
      resolveTaggedUsers(taggedUserIds),
      resolveTaggedPhotoUsers(photoObjects),
      resolveUserProfilePics([userId]),
    ]);

    const profileData = profileMap[userId.toString()] || {
      profilePic: null,
      profilePicUrl: null,
    };

    const reviewResponse = {
      _id: createdReview._id,
      placeId,
      userId,
      fullName,
      rating,
      priceRating,
      serviceRating,
      atmosphereRating,
      wouldRecommend,
      reviewText,
      businessName,
      profilePic: profileData.profilePic,
      profilePicUrl: profileData.profilePicUrl,
      taggedUsers: populatedTaggedUsers,
      date,
      photos: populatedPhotos,
      type: "review",
    };

    res.status(201).json({ message: "Review added successfully", review: reviewResponse });
  } catch (error) {
    console.error("❌ Error adding review:", error);
    res.status(500).json({ message: "Server error" });
  }
});

//edit reviews
router.put("/:placeId/:reviewId", async (req, res) => {
  const { placeId, reviewId } = req.params;
  const { rating, priceRating, serviceRating, atmosphereRating, wouldRecommend, reviewText, photos, taggedUsers } = req.body;

  console.log('service rating', serviceRating);
  console.log('would recommend', wouldRecommend);
  try {
    const business = await Business.findOne({ placeId });
    if (!business) return res.status(404).json({ message: "Business not found" });

    const reviewIndex = business.reviews.findIndex(r => r._id.toString() === reviewId);
    if (reviewIndex === -1) return res.status(404).json({ message: "Review not found" });

    const review = business.reviews[reviewIndex];

    // 1. Store previous tagged user IDs
    const previousTaggedUserIds = review.taggedUsers?.map(id => id.toString()) || [];
    const previousPhotos = review.photos || [];
    const previousPhotoTaggedUserIds = previousPhotos.flatMap(photo =>
      (photo.taggedUsers || []).map(tag => tag.userId?.toString())
    );

    const previousPhotosByKey = new Map();
    previousPhotos.forEach((photo) => {
      if (photo.photoKey) {
        previousPhotosByKey.set(photo.photoKey, photo);
      }
    });

    // 2. Update basic fields
    if (rating !== undefined) review.rating = rating;
    if (priceRating !== undefined) review.priceRating = priceRating;
    if (serviceRating !== undefined) review.serviceRating = serviceRating;
    if (atmosphereRating !== undefined) review.atmosphereRating = atmosphereRating;
    if (wouldRecommend !== undefined) review.wouldRecommend = wouldRecommend;
    
    if (reviewText !== undefined) review.reviewText = reviewText;

    // 3. Update tagged users
    const taggedUserIds = taggedUsers.map(t => t.userId || t._id || t);
    review.taggedUsers = taggedUserIds;

    // 4. Process photos and collect new tagged user IDs
    const newPhotoTaggedUserIds = [];
    const newPhotosByKey = new Map();

    if (Array.isArray(photos)) {
      review.photos = await Promise.all(
        photos.map(async (photo) => {
          const formattedTagged = Array.isArray(photo.taggedUsers)
            ? photo.taggedUsers.map(tag => {
              newPhotoTaggedUserIds.push(tag.userId?.toString());
              return {
                userId: tag.userId,
                x: tag.x,
                y: tag.y,
              };
            })
            : [];

          newPhotosByKey.set(photo.photoKey, photo);

          return {
            photoKey: photo.photoKey,
            uploadedBy: review.userId,
            description: photo.description || null,
            taggedUsers: formattedTagged,
            uploadDate: new Date(),
          };
        })
      );
    }

    // 5. Detect added/removed photos
    const deletedPhotoKeys = [...previousPhotosByKey.keys()].filter(
      key => !newPhotosByKey.has(key)
    );
    const addedPhotoKeys = [...newPhotosByKey.keys()].filter(
      key => !previousPhotosByKey.has(key)
    );

    const removedPhotoTaggedUserIds = deletedPhotoKeys.flatMap((key) => {
      const photo = previousPhotosByKey.get(key);
      return photo?.taggedUsers?.map(tag => tag.userId?.toString()) || [];
    });

    const addedPhotoTaggedUserIds = addedPhotoKeys.flatMap((key) => {
      const photo = newPhotosByKey.get(key);
      return photo?.taggedUsers?.map(tag => tag.userId?.toString()) || [];
    });

    await business.save();

    // 6. Compute diffs
    const currentTaggedSet = new Set(taggedUserIds.map(String));
    const currentPhotoTaggedSet = new Set([
      ...newPhotoTaggedUserIds,
      ...addedPhotoTaggedUserIds,
    ]);

    const oldTaggedSet = new Set(previousTaggedUserIds);
    const oldPhotoTaggedSet = new Set([
      ...previousPhotoTaggedUserIds,
      ...removedPhotoTaggedUserIds,
    ]);

    const reviewTagsAdded = [...currentTaggedSet].filter(id => !oldTaggedSet.has(id));
    const reviewTagsRemoved = [...oldTaggedSet].filter(id => !currentTaggedSet.has(id));

    const photoTagsAdded = [...currentPhotoTaggedSet].filter(id => !oldPhotoTaggedSet.has(id));
    const photoTagsRemoved = [...oldPhotoTaggedSet].filter(id => !currentPhotoTaggedSet.has(id));

    const removalIds = [...new Set([...reviewTagsRemoved, ...photoTagsRemoved])];
    const removalPromises = removalIds.map(userId =>
      User.findByIdAndUpdate(userId, {
        $pull: { notifications: { targetId: review._id } },
      })
    );

    // 7. Add notifications to newly tagged users
    const additionPromises = [
      ...reviewTagsAdded.map(userId =>
        User.findByIdAndUpdate(userId, {
          $push: {
            notifications: {
              type: "tag",
              message: `${review.fullName} tagged you in a review.`,
              targetId: review._id,
              typeRef: "Review",
              senderId: review.userId,
              date: new Date(),
              read: false,
            },
          },
        })
      ),
      ...photoTagsAdded.map(userId =>
        User.findByIdAndUpdate(userId, {
          $push: {
            notifications: {
              type: "photoTag",
              message: `${review.fullName} tagged you in a photo.`,
              targetId: review._id,
              typeRef: "Review",
              senderId: review.userId,
              date: new Date(),
              read: false,
            },
          },
        })
      ),
    ];

    await Promise.all([...removalPromises, ...additionPromises]);

    // 8. Enrich data
    const [populatedTaggedUsers, populatedPhotos, profileMap] = await Promise.all([
      resolveTaggedUsers(taggedUserIds),
      resolveTaggedPhotoUsers(review.photos),
      resolveUserProfilePics([review.userId]),
    ]);

    const profileData = profileMap[review.userId.toString()] || {
      profilePic: null,
      profilePicUrl: null,
    };

    res.status(200).json({
      message: "Review updated successfully",
      review: {
        _id: review._id,
        placeId,
        businessName: business.businessName,
        userId: review.userId,
        fullName: review.fullName,
        profilePic: profileData.profilePic,
        profilePicUrl: profileData.profilePicUrl,
        rating: review.rating,
        priceRating: review.priceRating,
        serviceRating: review.serviceRating,
        atmosphereRating: review.atmosphereRating,
        wouldRecommend: review.wouldRecommend,
        reviewText: review.reviewText,
        taggedUsers: populatedTaggedUsers,
        date: review.date,
        photos: populatedPhotos,
        type: "review",
        likes: review.likes || [],
      },
    });

  } catch (error) {
    console.error("🚨 Error updating review:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete a review by its ObjectId
router.delete('/:placeId/:reviewId', async (req, res) => {
  const { placeId, reviewId } = req.params;

  try {
    const reviewObjectId = new mongoose.Types.ObjectId(reviewId);

    // Find the business by placeId
    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    // Find the review to remove
    const reviewIndex = business.reviews.findIndex(
      (review) => review._id.toString() === reviewId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const review = business.reviews[reviewIndex];

    // Clean up notifications from tagged users
    if (review.taggedUsers && review.taggedUsers.length > 0) {
      const taggedUserUpdatePromises = review.taggedUsers.map((userId) => {
        return User.findByIdAndUpdate(userId, {
          $pull: { notifications: { targetId: reviewObjectId } },
        });
      });

      await Promise.all(taggedUserUpdatePromises);
      console.log(`🔧 Removed notifications from ${review.taggedUsers.length} tagged users`);
    }

    // Remove the notification from the business itself
    await Business.updateOne(
      { placeId },
      {
        $pull: {
          notifications: { targetId: reviewObjectId },
        },
      }
    );
    console.log(`🏢 Removed notification from business with placeId ${placeId}`);

    // Remove the review
    business.reviews.splice(reviewIndex, 1);
    await business.save();

    res.status(200).json({ message: 'Review and all related notifications deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting review:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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

    const reviews = business.reviews || [];
    const userIds = reviews.map(r => r.userId?.toString()).filter(Boolean);

    // ✅ Use helper to get user profile pics
    const profileMap = await resolveUserProfilePics(userIds);

    // ✅ Format each review with profilePic and resolved photos
    const updatedReviews = await Promise.all(
      reviews.map(async (review) => {
        const profileData = profileMap[review.userId?.toString()] || {
          profilePic: null,
          profilePicUrl: null,
        };

        const enrichedPhotos = await resolveTaggedPhotoUsers(review.photos || []);

        return {
          ...review.toObject(),
          profilePic: profileData.profilePic,
          profilePicUrl: profileData.profilePicUrl,
          photos: enrichedPhotos,
        };
      })
    );

    res.status(200).json({ reviews: updatedReviews });
  } catch (error) {
    console.error('❌ Error retrieving reviews with profile and photo URLs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle like on a review, invite or check-in
router.post('/:postType/:placeId/:postId/like', async (req, res) => {
  const { postType, placeId, postId } = req.params;
  const { userId, fullName } = req.body;

  try {
    let post, postCollection, ownerId;

    if (postType === 'review') {
      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });

      postCollection = business.reviews;
      post = postCollection.id(postId);
      ownerId = post?.userId;

      if (!post) return res.status(404).json({ message: 'Review not found' });

      // Toggle like
      const likeIndex = post.likes.findIndex(like => like.userId === userId);
      const isLiking = likeIndex === -1;
      if (isLiking) {
        post.likes.push({ userId, fullName, date: new Date() });
      } else {
        post.likes.splice(likeIndex, 1);
      }

      await Business.updateOne(
        { placeId },
        { $set: { reviews: postCollection } }
      );

      if (!isLiking) {
        await User.findByIdAndUpdate(ownerId, {
          $pull: { notifications: { type: 'like', targetId: postId } },
        });
      }

      return res.status(200).json({ message: isLiking ? 'Like added' : 'Like removed', likes: post.likes });

    } else if (postType === 'check-in' || postType === 'checkin') {
      const user = await User.findOne({ 'checkIns._id': postId });
      if (!user) return res.status(404).json({ message: 'Check-in not found' });

      postCollection = user.checkIns;
      post = postCollection.id(postId);
      ownerId = post?.userId;

      if (!post) return res.status(404).json({ message: 'Check-in not found' });

      const likeIndex = post.likes.findIndex(like => like.userId === userId);
      const isLiking = likeIndex === -1;

      if (isLiking) {
        post.likes.push({ userId, fullName, date: new Date() });
      } else {
        post.likes.splice(likeIndex, 1);
      }

      await User.updateOne(
        { _id: ownerId },
        { $set: { checkIns: postCollection } }
      );

      if (!isLiking) {
        await User.findByIdAndUpdate(ownerId, {
          $pull: { notifications: { type: 'like', targetId: postId } },
        });
      }

      return res.status(200).json({ message: isLiking ? 'Like added' : 'Like removed', likes: post.likes });

    } else if (postType === 'invite') {
      const invite = await ActivityInvite.findById(postId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });

      const likeIndex = invite.likes.findIndex(like => like.userId === userId);
      const isLiking = likeIndex === -1;

      if (isLiking) {
        invite.likes.push({ userId, fullName, date: new Date() });
      } else {
        invite.likes.splice(likeIndex, 1);
      }

      await invite.save();

      if (!isLiking) {
        await User.findByIdAndUpdate(invite.senderId, {
          $pull: { notifications: { type: 'like', targetId: postId } },
        });
      }

      return res.status(200).json({ message: isLiking ? 'Like added' : 'Like removed', likes: invite.likes });

    } else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

  } catch (error) {
    console.error('❌ Like toggle error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a comment to a review invite or check-in
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

      const newComment = review.comments.create({ userId, commentText, fullName });
      review.comments.push(newComment);
      await business.save();

      savedComment = newComment;
    }

    else if (postType === 'check-in') {
      const user = await User.findOne({ 'checkIns._id': reviewId });
      if (!user) return res.status(404).json({ message: 'Check-in post not found' });

      const checkInPost = user.checkIns.id(reviewId);
      if (!checkInPost) return res.status(404).json({ message: 'Check-in post not found' });

      const newComment = checkInPost.comments.create({ userId, commentText, fullName });
      checkInPost.comments.push(newComment);
      await user.save();

      savedComment = newComment;
    }

    else if (postType === 'invite') {
      const invite = await ActivityInvite.findById(reviewId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });

      const newComment = invite.comments.create({ userId, commentText, fullName });
      invite.comments.push(newComment);
      await invite.save();

      savedComment = newComment;
    }

    if (!savedComment) return res.status(500).json({ message: 'Error saving comment' });

    return res.status(201).json({
      message: `Comment added to ${postType} successfully`,
      comment: savedComment,
    });

  } catch (error) {
    console.error('🚨 Error adding comment:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Add a reply to a comment in a review invite or check-in
router.post('/:postType/:placeId/:postId/:commentId/reply', async (req, res) => {
  const { postType, placeId, postId, commentId } = req.params;
  const { userId, fullName, commentText } = req.body;

  try {
    let target = null;
    let parentCommentOwner = null;
    let docToSave = null;
    let business = null;
    let user = null;
    let invite = null;

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
      business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });

      const review = business.reviews.id(postId);
      if (!review) return res.status(404).json({ message: 'Review not found' });

      target = findCommentOrReply(review.comments, commentId);
      if (!target) return res.status(404).json({ message: 'Comment or reply not found' });

      parentCommentOwner = target.userId;
      docToSave = business;
    }

    else if (postType === 'check-in') {
      user = await User.findOne({ 'checkIns._id': postId });
      if (!user) return res.status(404).json({ message: 'Check-in post not found' });

      const checkInPost = user.checkIns.id(postId);
      if (!checkInPost) return res.status(404).json({ message: 'Check-in post not found' });

      target = findCommentOrReply(checkInPost.comments, commentId);
      if (!target) return res.status(404).json({ message: 'Comment or reply not found' });

      parentCommentOwner = target.userId;
      docToSave = user;
    }

    else if (postType === 'invite') {
      invite = await ActivityInvite.findById(postId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });

      target = findCommentOrReply(invite.comments, commentId);
      if (!target) return res.status(404).json({ message: 'Comment or reply not found' });

      parentCommentOwner = target.userId;
      docToSave = invite;
    }

    else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    if (!target) {
      return res.status(404).json({ message: 'Target comment/reply not found' });
    }

    const newReply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      replies: [],
    };

    target.replies.push(newReply);

    if (postType === 'review') {
      business.markModified('reviews');
    } else if (postType === 'check-in') {
      user.markModified('checkIns');
    } else if (postType === 'invite') {
      invite.markModified('comments');
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
          comments.splice(i, 1);

          // Remove the related notification
          User.findByIdAndUpdate(relatedId, {
            $pull: {
              notifications: {
                $or: [
                  { type: 'reply', replyId: new mongoose.Types.ObjectId(targetId) },
                  { type: 'comment', commentId: new mongoose.Types.ObjectId(targetId) }
                ]
              }
            }
          }, { new: true }).catch(error =>
            console.error('Error removing notification:', error)
          );

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
      if (!checkInPost) return res.status(404).json({ message: 'Check-in not found' });

      targetComments = checkInPost.comments;
      docToSave = user;
    }

    else if (postType === 'invite') {
      const invite = await ActivityInvite.findById(postId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });

      targetComments = invite.comments;
      docToSave = invite;
    }

    else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    if (!targetComments) {
      return res.status(404).json({ message: 'No comments found for this post' });
    }

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

    const updateCommentOrReply = (comments) => {
      for (let comment of comments) {
        if (comment._id.toString() === commentId) {
          if (comment.userId.toString() !== userId) {
            return { error: 'Unauthorized' };
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

    else if (postType === 'invite') {
      const invite = await ActivityInvite.findById(postId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });

      targetComments = invite.comments;
      docToSave = invite;
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
    } else if (postType === 'invite') {
      docToSave.markModified('comments'); // Explicitly mark invite's comments as modified
    }

    await docToSave.save();

    res.status(200).json({ message: 'Comment edited successfully', updatedComment: result.updated });

  } catch (error) {
    console.error('🚨 Error editing comment or reply:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//Toggle like on comments & replies
router.put('/:postType/:placeId/:postId/:commentId/like', async (req, res) => {
  const { postType, placeId, postId, commentId } = req.params;
  const { userId, replyId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    let targetComments = null;
    let docToSave = null;

    const toggleLike = (target) => {
      if (!Array.isArray(target.likes)) target.likes = [];
      const likeIndex = target.likes.findIndex(id => id.toString() === userId);
      const isLike = likeIndex === -1;

      if (isLike) target.likes.push(userId);
      else target.likes.splice(likeIndex, 1);

      return {
        updatedLikes: target.likes,
        isLike,
        targetOwnerId: target.userId?.toString() || null,
        targetId: target._id?.toString()
      };
    };

    const findReplyRecursively = (replies, targetId) => {
      for (let reply of replies) {
        if (reply._id.toString() === targetId) return reply;
        if (Array.isArray(reply.replies)) {
          const nested = findReplyRecursively(reply.replies, targetId);
          if (nested) return nested;
        }
      }
      return null;
    };

    const findAndToggle = (comments) => {
      for (let comment of comments) {
        if (comment._id.toString() === commentId) {
          if (replyId) {
            const reply = findReplyRecursively(comment.replies || [], replyId);
            if (!reply) return { error: 'Reply not found' };
            return { ...toggleLike(reply) };
          } else {
            return { ...toggleLike(comment) };
          }
        }
        if (Array.isArray(comment.replies)) {
          const nested = findAndToggle(comment.replies);
          if (nested) return nested;
        }
      }
      return null;
    };

    // Load correct post type
    if (postType === 'review') {
      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ message: 'Business not found' });
      const review = business.reviews.id(postId);
      if (!review) return res.status(404).json({ message: 'Review not found' });
      targetComments = review.comments;
      docToSave = business;
    } else if (postType === 'check-in') {
      const user = await User.findOne({ 'checkIns._id': postId });
      if (!user) return res.status(404).json({ message: 'Check-in post not found' });
      const checkIn = user.checkIns.id(postId);
      if (!checkIn) return res.status(404).json({ message: 'Check-in not found' });
      targetComments = checkIn.comments;
      docToSave = user;
    } else if (postType === 'invite') {
      const invite = await ActivityInvite.findById(postId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });
      targetComments = invite.comments;
      docToSave = invite;
    } else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    if (!Array.isArray(targetComments)) {
      return res.status(404).json({ message: 'No comments found in the post' });
    }

    const result = findAndToggle(targetComments);
    if (!result || result.error) {
      return res.status(404).json({ message: result?.error || 'Comment or reply not found' });
    }

    const { updatedLikes, isLike, targetOwnerId } = result;
    const targetId = postId;

    // Ensure change is saved
    if (postType === 'review') docToSave.markModified('reviews');
    if (postType === 'check-in') docToSave.markModified('checkIns');
    if (postType === 'invite') docToSave.markModified('comments');
    await docToSave.save();

    let sender = "Someone";
    if (targetOwnerId && targetOwnerId !== userId) {
      const notifSender = await User.findById(userId);
      if (notifSender) {
        sender = `${notifSender.firstName} ${notifSender.lastName}`;
      }

      await handleNotification({
        type: 'like',
        recipientId: targetOwnerId,
        actorId: userId,
        message: `${sender} liked your comment`,
        commentId,
        replyId: replyId || null,
        targetId,
        postType,
        isCreate: isLike,
      });
    }

    return res.status(200).json({ message: 'Like toggled successfully', updatedLikes });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
