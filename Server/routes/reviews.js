const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const Review = require('../models/Reviews');
const User = require('../models/User');
const ActivityInvite = require('../models/ActivityInvites.js');
const CheckIn = require('../models/CheckIns.js');
const mongoose = require('mongoose');
const { handleNotification } = require('../utils/notificationHandler.js');
const { resolveTaggedPhotoUsers, resolveTaggedUsers, resolveUserProfilePics } = require('../utils/userPosts.js')
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

/////// Retrieve a review by its reviewId
router.get('/:postType/:postId', async (req, res) => {
  const { postType, postId } = req.params;

  try {
    let post = null;
    let profilePicUrl = null;
    let business = null;
    let businessName = null;
    let user = null;
    let sender = null;
    let taggedUsers = [];
    let photosWithUrls = [];

    if (postType === 'review') {
      post = await Review.findById(postId).lean();
      if (!post) return res.status(404).json({ message: "Review not found" });

      // ⏩ Start parallel data fetches
      const [business, postUser, taggedUsersRaw, profileMap, photoResults] = await Promise.all([
        Business.findOne({ placeId: post.placeId }).lean(),
        User.findById(post.userId).select("firstName lastName profilePic").lean(),
        User.find({ _id: { $in: post.taggedUsers || [] } }, { firstName: 1, lastName: 1 }).lean(),
        resolveUserProfilePics([post.userId]),
        Promise.all(
          (post.photos || []).map(async (photo) => {
            const taggedUsersRaw = await User.find(
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
              taggedUsers: taggedUsersRaw.map(user => {
                const match = photo.taggedUsers.find(tag => tag.userId.toString() === user._id.toString());
                return {
                  userId: user._id,
                  fullName: `${user.firstName} ${user.lastName}`,
                  x: match?.x,
                  y: match?.y,
                };
              }),
            };
          })
        ),
      ]);

      taggedUsers = taggedUsersRaw.map(user => ({
        userId: user._id,
        fullName: `${user.firstName} ${user.lastName}`,
      }));

      profilePicUrl = profileMap[post.userId?.toString()]?.profilePicUrl || null;
      businessName = business?.businessName || null;
      placeId = post.placeId || business?.placeId || null;
      photosWithUrls = photoResults;
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

///////Create a new review
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
    // 🧱 Ensure business exists (upsert minimal shell if needed)
    const business = await Business.findOneAndUpdate(
      { placeId },
      {
        $setOnInsert: {
          placeId,
          businessName: businessName || "Unknown Business",
          location: {
            type: "Point",
            coordinates: [0, 0],
            formattedAddress: location?.formattedAddress || "Unknown Address",
          },
          firstName: "N/A",
          lastName: "N/A",
          email: "N/A",
          password: "N/A",
        },
      },
      { upsert: true, new: true }
    );

    // 🎨 Format photos
    const photoObjects = await Promise.all(
      (photos || []).map(async (photo) => {
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

    // 🏷️ Extract tagged user IDs
    const taggedUserIds = (taggedUsers || []).map(t =>
      typeof t === "object" && t !== null ? t.userId || t._id : t
    ).filter(Boolean);

    // 📝 Create review document
    const newReview = await Review.create({
      userId,
      placeId,
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
    });

    // 🧠 Resolve profile and tag data
    const [populatedTaggedUsers, populatedPhotos, profileMap] = await Promise.all([
      resolveTaggedUsers(taggedUserIds),
      resolveTaggedPhotoUsers(photoObjects),
      resolveUserProfilePics([userId]),
    ]);

    const profileData = profileMap[userId.toString()] || {
      profilePic: null,
      profilePicUrl: null,
    };

    // 📦 Compose response
    const reviewResponse = {
      _id: newReview._id,
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

/////edit reviews
router.put("/:placeId/:reviewId", async (req, res) => {
  const { placeId, reviewId } = req.params;
  const {
    rating,
    priceRating,
    serviceRating,
    atmosphereRating,
    wouldRecommend,
    reviewText,
    photos,
    taggedUsers,
  } = req.body;

  try {
    // 1. Find and validate the review
    const review = await Review.findById(reviewId);
    if (!review || review.placeId !== placeId) {
      return res.status(404).json({ message: "Review not found for this place" });
    }

    const previousTaggedUserIds = review.taggedUsers.map(id => id.toString());
    const previousPhotos = review.photos || [];
    const previousPhotosByKey = new Map(
      previousPhotos.map(p => [p.photoKey, p])
    );

    // 2. Update core fields
    if (rating !== undefined) review.rating = rating;
    if (priceRating !== undefined) review.priceRating = priceRating;
    if (serviceRating !== undefined) review.serviceRating = serviceRating;
    if (atmosphereRating !== undefined) review.atmosphereRating = atmosphereRating;
    if (wouldRecommend !== undefined) review.wouldRecommend = wouldRecommend;
    if (reviewText !== undefined) review.reviewText = reviewText;

    // 3. Handle tagged users
    const taggedUserIds = (taggedUsers || []).map(t => t.userId || t._id || t);
    review.taggedUsers = taggedUserIds;

    // 4. Handle photos
    const newPhotoTaggedUserIds = [];
    const newPhotosByKey = new Map();

    review.photos = await Promise.all(
      (photos || []).map(async (photo) => {
        const formattedTagged = (photo.taggedUsers || []).map(tag => {
          newPhotoTaggedUserIds.push(tag.userId?.toString());
          return {
            userId: tag.userId,
            x: tag.x,
            y: tag.y,
          };
        });

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

    // 5. Compute diffs
    const deletedPhotoKeys = [...previousPhotosByKey.keys()].filter(k => !newPhotosByKey.has(k));
    const addedPhotoKeys = [...newPhotosByKey.keys()].filter(k => !previousPhotosByKey.has(k));

    const removedPhotoTaggedUserIds = deletedPhotoKeys.flatMap(key =>
      previousPhotosByKey.get(key)?.taggedUsers?.map(tag => tag.userId.toString()) || []
    );
    const addedPhotoTaggedUserIds = addedPhotoKeys.flatMap(key =>
      newPhotosByKey.get(key)?.taggedUsers?.map(tag => tag.userId.toString()) || []
    );

    const oldTaggedSet = new Set([...previousTaggedUserIds, ...removedPhotoTaggedUserIds]);
    const newTaggedSet = new Set([...taggedUserIds.map(String), ...newPhotoTaggedUserIds, ...addedPhotoTaggedUserIds]);

    const removedTags = [...oldTaggedSet].filter(x => !newTaggedSet.has(x));
    const addedTags = [...newTaggedSet].filter(x => !oldTaggedSet.has(x));

    // 6. Remove old notifications
    await Promise.all(
      removedTags.map(userId =>
        User.findByIdAndUpdate(userId, {
          $pull: { notifications: { targetId: review._id } },
        })
      )
    );

    // 7. Add new notifications
    await Promise.all(
      addedTags.map(userId =>
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
      )
    );

    await review.save();

    // 8. Enrich response
    const [populatedTaggedUsers, populatedPhotos, profileMap, business] = await Promise.all([
      resolveTaggedUsers(taggedUserIds),
      resolveTaggedPhotoUsers(review.photos),
      resolveUserProfilePics([review.userId]),
      Business.findOne({ placeId }).lean()
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
        businessName: business?.businessName || "Unknown Business",
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

//// Delete a review by its ObjectId
router.delete('/:placeId/:reviewId', async (req, res) => {
  const { placeId, reviewId } = req.params;

  try {
    const reviewObjectId = new mongoose.Types.ObjectId(reviewId);

    // 1. Find the review
    const review = await Review.findById(reviewObjectId);
    if (!review || review.placeId !== placeId) {
      return res.status(404).json({ message: 'Review not found for this place' });
    }

    // 2. Remove related notifications from tagged users
    if (review.taggedUsers?.length) {
      await User.updateMany(
        { _id: { $in: review.taggedUsers } },
        { $pull: { notifications: { targetId: reviewObjectId } } }
      );
      console.log(`🔧 Removed notifications from ${review.taggedUsers.length} tagged users`);
    }

    // 3. Remove notification from business
    await Business.updateOne(
      { placeId },
      { $pull: { notifications: { targetId: reviewObjectId } } }
    );
    console.log(`🏢 Removed notification from business with placeId ${placeId}`);

    // 4. Delete the review
    await Review.deleteOne({ _id: reviewObjectId });

    res.status(200).json({ message: 'Review and related notifications deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting review:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

////// Retrieve reviews by user ID
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const objectId = new mongoose.Types.ObjectId(userId);

    // Fetch all reviews by userId
    const reviews = await Review.find({ userId: objectId }).lean();

    if (!reviews.length) {
      return res.status(200).json({ reviews: [] });
    }

    // Optionally fetch business names in bulk
    const placeIds = [...new Set(reviews.map(r => r.placeId))];
    const businesses = await Business.find({ placeId: { $in: placeIds } }, { placeId: 1, businessName: 1 }).lean();
    const businessMap = new Map(businesses.map(biz => [biz.placeId, biz.businessName]));

    // Attach businessName to each review
    const reviewsWithBusiness = reviews.map(review => ({
      ...review,
      businessName: businessMap.get(review.placeId) || 'Unknown',
    }));

    res.status(200).json({ reviews: reviewsWithBusiness });
  } catch (error) {
    console.error('❌ Error retrieving reviews by userId:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

////
router.get('/:placeId', async (req, res) => {
  const { placeId } = req.params;

  try {
    // 🔍 Step 1: Get all reviews for this place
    const reviews = await Review.find({ placeId }).lean();
    if (!reviews.length) {
      return res.status(200).json({ reviews: [] });
    }

    // 🧠 Step 2: Get all unique userIds
    const userIds = reviews.map(r => r.userId?.toString()).filter(Boolean);

    // 📸 Step 3: Resolve profile picture URLs
    const profileMap = await resolveUserProfilePics(userIds);

    // 🧩 Step 4: Enrich reviews with profile pics and resolved photo tags
    const enrichedReviews = await Promise.all(
      reviews.map(async (review) => {
        const profileData = profileMap[review.userId?.toString()] || {
          profilePic: null,
          profilePicUrl: null,
        };

        const enrichedPhotos = await resolveTaggedPhotoUsers(review.photos || []);

        return {
          ...review,
          profilePic: profileData.profilePic,
          profilePicUrl: profileData.profilePicUrl,
          photos: enrichedPhotos,
          type: "review",
        };
      })
    );

    res.status(200).json({ reviews: enrichedReviews });
  } catch (error) {
    console.error('❌ Error retrieving reviews by placeId:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle like on a review, invite or check-in
router.post('/:postType/:placeId/:postId/like', async (req, res) => {
  const { postType, placeId, postId } = req.params;
  const { userId, fullName } = req.body;

  try {
    let post = null;
    let ownerId = null;
    let model = null;

    switch (postType) {
      case 'review':
        model = Review;
        break;
      case 'check-in':
      case 'checkin':
        model = CheckIn;
        break;
      case 'invite':
        model = ActivityInvite;
        break;
      default:
        return res.status(400).json({ message: 'Invalid post type' });
    }

    post = await model.findById(postId);
    if (!post) return res.status(404).json({ message: `${postType} not found` });

    ownerId = post.userId?.toString() || post.senderId?.toString(); // Reviews/CheckIns use userId; invites use senderId

    const likeIndex = post.likes.findIndex(
      (like) => like.userId.toString() === userId
    );
    const isLiking = likeIndex === -1;

    if (isLiking) {
      post.likes.push({ userId, fullName, date: new Date() });
    } else {
      post.likes.splice(likeIndex, 1);
    }

    await post.save();

    // 🛎️ Optionally remove notification if unliking
    if (!isLiking && ownerId && ownerId !== userId) {
      await User.findByIdAndUpdate(ownerId, {
        $pull: { notifications: { type: 'like', targetId: post._id } },
      });
    }

    return res.status(200).json({
      message: isLiking ? 'Like added' : 'Like removed',
      likes: post.likes,
    });

  } catch (error) {
    console.error('❌ Like toggle error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a comment to a review invite or check-in
router.post('/:postType/:placeId/:postId/comment', async (req, res) => {
  const { postType, placeId, postId } = req.params;
  const { userId, commentText, fullName } = req.body;

  try {
    let savedComment = null;

    if (postType === 'review') {
      const review = await Review.findById(postId);
      if (!review) return res.status(404).json({ message: 'Review not found' });

      const newComment = {
        _id: new mongoose.Types.ObjectId(),
        userId,
        fullName,
        commentText,
        createdAt: new Date(),
      };

      review.comments.push(newComment);
      await review.save();

      savedComment = review.comments[review.comments.length - 1];
    }

    else if (postType === 'check-in') {
      const user = await User.findOne({ 'checkIns._id': postId });
      if (!user) return res.status(404).json({ message: 'Check-in post not found' });

      const checkInPost = user.checkIns.id(postId);
      if (!checkInPost) return res.status(404).json({ message: 'Check-in post not found' });

      const newComment = {
        _id: new mongoose.Types.ObjectId(),
        userId,
        fullName,
        commentText,
        createdAt: new Date(),
      };

      checkInPost.comments.push(newComment);
      await user.save();

      savedComment = checkInPost.comments[checkInPost.comments.length - 1];
    }

    else if (postType === 'invite') {
      const invite = await ActivityInvite.findById(postId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });

      const newComment = {
        _id: new mongoose.Types.ObjectId(),
        userId,
        fullName,
        commentText,
        createdAt: new Date(),
      };

      invite.comments.push(newComment);
      await invite.save();

      savedComment = invite.comments[invite.comments.length - 1];
    }

    if (!savedComment) {
      return res.status(500).json({ message: 'Error saving comment' });
    }

    return res.status(201).json({
      message: `Comment added to ${postType} successfully`,
      comment: savedComment,
    });

  } catch (error) {
    console.error('🚨 Error adding comment:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST: Add a reply to a comment
router.post('/:postType/:postId/:commentId/reply', async (req, res) => {
  const { postType, postId, commentId } = req.params;
  const { userId, fullName, commentText } = req.body;

  console.log(`📥 Incoming reply request → type: ${postType}, postId: ${postId}, commentId: ${commentId}`);
  console.log(`👤 userId: ${userId}, fullName: ${fullName}, commentText: ${commentText}`);

  if (!userId || !fullName || !commentText) {
    console.warn("⚠️ Missing required fields in request body");
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const findCommentRecursively = (comments = [], targetId) => {
      for (const comment of comments) {
        if (!comment || !comment._id) continue;
        if (comment._id.toString() === targetId) return comment;

        if (Array.isArray(comment.replies) && comment.replies.length > 0) {
          const nested = findCommentRecursively(comment.replies, targetId);
          if (nested) return nested;
        }
      }
      return null;
    };

    let model, markPath;
    if (postType === 'review') {
      model = Review;
      markPath = 'comments';
    } else if (postType === 'check-in') {
      model = User;
      markPath = 'checkIns';
    } else if (postType === 'invite') {
      model = ActivityInvite;
      markPath = 'comments';
    } else {
      console.error("❌ Invalid post type:", postType);
      return res.status(400).json({ message: 'Invalid post type' });
    }

    console.log(`🔍 Fetching ${postType} with ID: ${postId}`);
    const post = await model.findById(postId);

    if (!post) {
      console.warn(`🚫 ${postType} not found for ID: ${postId}`);
      return res.status(404).json({ message: `${postType} not found` });
    }

    let commentTree = post.comments;

    // If it's a check-in, dig into checkIns array to find the post
    if (postType === 'check-in') {
      const checkInPost = post.checkIns.id(postId);
      if (!checkInPost) {
        console.warn(`🚫 Check-in not found with ID: ${postId}`);
        return res.status(404).json({ message: 'Check-in not found' });
      }
      commentTree = checkInPost.comments;
    }

    console.log("🔎 Searching for target comment...");
    const targetComment = findCommentRecursively(commentTree, commentId);

    if (!targetComment) {
      console.warn("❌ Comment not found in tree:", commentId);
      return res.status(404).json({ message: 'Comment not found' });
    }

    const newReply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      replies: [],
    };

    console.log("💬 Adding reply:", newReply);
    targetComment.replies.push(newReply);

    console.log("📝 Marking modified for:", markPath);
    post.markModified(markPath);

    console.log("💾 Saving post with new reply...");
    await post.save();

    console.log("✅ Reply added successfully.");
    return res.status(201).json({
      message: `Reply added to ${postType} successfully`,
      reply: newReply,
      parentCommentOwner: targetComment.userId,
    });

  } catch (error) {
    console.error('🚨 Error adding reply:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:postType/:postId/:commentId', async (req, res) => {
  const { postType, postId, commentId } = req.params;
  const { relatedId } = req.body;

  const removeCommentOrReply = (comments, targetId) => {
    for (let i = 0; i < comments.length; i++) {
      if (comments[i]._id.toString() === targetId) {
        comments.splice(i, 1);
        return true;
      }
      if (comments[i].replies?.length > 0) {
        const foundInReplies = removeCommentOrReply(comments[i].replies, targetId);
        if (foundInReplies) return true;
      }
    }
    return false;
  };

  try {
    let doc;

    if (postType === 'review') {
      doc = await Review.findById(postId);
    } else if (postType === 'check-in') {
      doc = await CheckIn.findById(postId);
    } else if (postType === 'invite') {
      doc = await ActivityInvite.findById(postId);
    } else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    if (!doc) return res.status(404).json({ message: `${postType} not found` });
    const deleted = removeCommentOrReply(doc.comments, commentId);
    if (!deleted) return res.status(404).json({ message: 'Comment/reply not found' });

    await doc.save();

    if (relatedId) {
      await User.findByIdAndUpdate(relatedId, {
        $pull: {
          notifications: {
            $or: [
              { type: 'reply', replyId: commentId },
              { type: 'comment', commentId }
            ]
          }
        }
      });
    }

    res.status(200).json({ message: 'Comment/reply deleted successfully' });
  } catch (err) {
    console.error('❌ Delete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit a comment or reply
router.put('/:postType/:postId/:commentId', async (req, res) => {
  const { postType, postId, commentId } = req.params;
  const { userId, newText } = req.body;

  if (!newText) return res.status(400).json({ message: 'New text is required' });

  const updateCommentOrReply = (comments) => {
    for (let comment of comments) {
      if (comment._id.toString() === commentId) {
        if (comment.userId.toString() !== userId) return { error: 'Unauthorized' };
        comment.commentText = newText;
        return { updated: comment };
      }
      if (comment.replies?.length > 0) {
        const nested = updateCommentOrReply(comment.replies);
        if (nested) return nested;
      }
    }
    return null;
  };

  try {
    let doc;

    if (postType === 'review') {
      doc = await Review.findById(postId);
    } else if (postType === 'check-in') {
      doc = await CheckIn.findById(postId);
    } else if (postType === 'invite') {
      doc = await ActivityInvite.findById(postId);
    } else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    if (!doc) return res.status(404).json({ message: `${postType} not found` });
    const result = updateCommentOrReply(doc.comments);
    if (!result) return res.status(404).json({ message: 'Comment/reply not found' });
    if (result.error) return res.status(403).json({ message: result.error });

    await doc.save();
    res.status(200).json({ message: 'Comment updated successfully', updatedComment: result.updated });
  } catch (err) {
    console.error('❌ Edit error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

//Toggle like on comments & replies
router.put('/:postType/:postId/:commentId/like', async (req, res) => {
  const { postType, postId, commentId } = req.params;
  const { userId, replyId } = req.body;

  const user = await User.findById(userId).lean();
  const fullName = `${user.firstName} ${user.lastName}`;

  if (!userId || !fullName) {
    return res.status(400).json({ message: 'Missing userId or fullName' });
  }

  const toggleLike = (target) => {
    if (!Array.isArray(target.likes)) target.likes = [];

    const idx = target.likes.findIndex(like => like.userId?.toString() === userId);
    const isLike = idx === -1;

    if (isLike) {
      target.likes.push({ userId, fullName });
    } else {
      target.likes.splice(idx, 1);
    }

    return {
      updatedLikes: target.likes,
      isLike,
      targetOwnerId: target.userId?.toString()
    };
  };

  const findReplyRecursively = (replies, id) => {
    for (let reply of replies) {
      if (reply._id.toString() === id) return reply;
      if (reply.replies?.length) {
        const nested = findReplyRecursively(reply.replies, id);
        if (nested) return nested;
      }
    }
    return null;
  };

  const findAndToggle = (comments) => {
    for (let comment of comments) {
      if (comment._id.toString() === commentId) {
        if (replyId) {
          const reply = findReplyRecursively(comment.replies, replyId);
          if (!reply) return { error: 'Reply not found' };
          return toggleLike(reply);
        }
        return toggleLike(comment);
      }
      if (comment.replies?.length) {
        const nested = findAndToggle(comment.replies);
        if (nested) return nested;
      }
    }
    return null;
  };

  try {
    let doc;

    if (postType === 'review') {
      doc = await Review.findById(postId);
    } else if (postType === 'check-in') {
      doc = await CheckIn.findById(postId);
    } else if (postType === 'invite') {
      doc = await ActivityInvite.findById(postId);
    } else {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    if (!doc) return res.status(404).json({ message: `${postType} not found` });

    const result = findAndToggle(doc.comments);
    if (!result || result.error) return res.status(404).json({ message: result?.error || 'Not found' });

    doc.markModified('comments');
    await doc.save();

    if (result.targetOwnerId && result.targetOwnerId !== userId) {
      const sender = await User.findById(userId);

      await handleNotification({
        type: 'like',
        recipientId: result.targetOwnerId,
        actorId: userId,
        message: `${sender?.firstName || 'Someone'} liked your comment`,
        commentId,
        replyId: replyId || null,
        targetId: postId,
        postType,
        isCreate: result.isLike,
      });
    }

    res.status(200).json({ message: 'Like toggled', updatedLikes: result.updatedLikes });

  } catch (err) {
    console.error('❌ Like toggle error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
