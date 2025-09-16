const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const Review = require('../models/Reviews');
const User = require('../models/User');
const ActivityInvite = require('../models/ActivityInvites.js');
const mongoose = require('mongoose');
const { resolveTaggedPhotoUsers, resolveTaggedUsers, resolveUserProfilePics, enrichComments } = require('../utils/userPosts.js')
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

async function formatPhotoWithTaggedUsers(photo) {
  const taggedUsers = await User.find(
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
    taggedUsers: taggedUsers.map(user => {
      const match = photo.taggedUsers.find(tag => tag.userId.toString() === user._id.toString());
      return {
        userId: user._id,
        fullName: `${user.firstName} ${user.lastName}`,
        x: match?.x,
        y: match?.y,
      };
    }),
  };
}

async function getTaggedUsers(userIds = []) {
  const users = await User.find({ _id: { $in: userIds } }, { firstName: 1, lastName: 1 }).lean();
  return users.map(user => ({
    userId: user._id,
    fullName: `${user.firstName} ${user.lastName}`,
  }));
}

async function getProfilePicUrl(user) {
  if (user?.profilePic?.photoKey) {
    return await getPresignedUrl(user.profilePic.photoKey);
  }
  return null;
}

/////// Retrieve a review by its reviewId
router.get('/:postType/:postId', async (req, res) => {
  const { postType, postId } = req.params;

  try {
    let post = null;
    let user = null;
    let sender = null;
    let business = null;
    let profilePicUrl = null;
    let photosWithUrls = [];
    let taggedUsers = [];
    let enrichedComments = [];

    if (postType === 'review') {
      post = await Review.findById(postId).lean();
      if (!post) return res.status(404).json({ message: "Review not found" });

      const [userDoc, businessDoc, comments, profileMap] = await Promise.all([
        User.findById(post.userId).select("firstName lastName profilePic").lean(),
        Business.findOne({ placeId: post.placeId }).lean(),
        enrichComments(post.comments || []),
        resolveUserProfilePics([post.userId]),
      ]);

      user = userDoc;
      business = businessDoc;
      profilePicUrl = profileMap[post.userId?.toString()]?.profilePicUrl || null;
      taggedUsers = await getTaggedUsers(post.taggedUsers || []);
      photosWithUrls = await Promise.all((post.photos || []).map(formatPhotoWithTaggedUsers));
      enrichedComments = comments;

    } else if (postType === 'check-in') {
      const userWithCheckIn = await User.findOne({ "checkIns._id": postId });
      if (!userWithCheckIn) return res.status(404).json({ message: "Check-in not found" });

      post = userWithCheckIn.checkIns.id(postId);
      user = await User.findById(post.userId).select("firstName lastName profilePic").lean();
      business = post.placeId ? await Business.findOne({ placeId: post.placeId }).lean() : null;

      profilePicUrl = await getProfilePicUrl(user);
      taggedUsers = await getTaggedUsers(post.taggedUsers || []);
      photosWithUrls = await Promise.all((post.photos || []).map(formatPhotoWithTaggedUsers));
      enrichedComments = await enrichComments(post.comments || []);

    } else if (postType === 'invite') {
      post = await ActivityInvite.findById(postId).lean();
      if (!post) return res.status(404).json({ message: "Invite not found" });

      sender = await User.findById(post.senderId).select("firstName lastName profilePic").lean();
      profilePicUrl = await getProfilePicUrl(sender);
      business = await Business.findOne({ placeId: post.placeId }).lean();
      enrichedComments = await enrichComments(post.comments || []);

    } else {
      return res.status(400).json({ message: "Invalid post type" });
    }

    const fullName =
      postType === 'invite'
        ? `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim()
        : post.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

    res.status(200).json({
      _id: post._id,
      userId: postType === 'invite' ? post.senderId : post.userId,
      fullName,
      rating: postType === 'review' ? post.rating : null,
      priceRating: postType === 'review' ? post.priceRating : null,
      atmosphereRating: postType === 'review' ? post.atmosphereRating : null,
      serviceRating: postType === 'review' ? post.serviceRating : null,
      wouldRecommend: postType === 'review' ? post.wouldRecommend : null,
      reviewText: postType === 'review' ? post.reviewText : null,
      message: post.message || null,
      date: post.timestamp || post.date || post.dateTime,
      photos: photosWithUrls,
      likes: post.likes || [],
      comments: enrichedComments,
      profilePicUrl,
      businessName: business?.businessName || null,
      placeId: post.placeId || business?.placeId || null,
      recipients: postType === 'invite' ? post.recipients : undefined,
      requests: postType === 'invite' ? post.requests || [] : undefined,
      note: postType === 'invite' ? post.note : undefined,
      isPublic: postType === 'invite' ? post.isPublic : undefined,
      taggedUsers,
      type: postType,
    });
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

module.exports = router;
