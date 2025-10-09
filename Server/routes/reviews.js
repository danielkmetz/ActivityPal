const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const Review = require('../models/Reviews');
const User = require('../models/User');
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const { resolveTaggedPhotoUsers, resolveTaggedUsers, resolveUserProfilePics } = require('../utils/userPosts.js')
const { getPostPayloadById } = require('../utils/normalizePostStructure.js');

/////// Retrieve a review by its reviewId
router.get('/:postType/:postId', async (req, res) => {
  const TAG = '[GET /:postType/:postId]';
  const now = () => new Date().toISOString();
  const { postType: rawType, postId } = req.params;

  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });

  try {
    const payload = await getPostPayloadById(rawType, postId);
    if (!payload) return res.status(404).json({ message: 'Post not found' });
    return res.status(200).json(payload);
  } catch (err) {
    console.error(`${TAG} ❌ 500`, { at: now(), rawType, postId, message: err?.message });
    return res.status(500).json({ message: 'Server error', error: err?.message });
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
    }

    // 3. Remove notification from business
    await Business.updateOne(
      { placeId },
      { $pull: { notifications: { targetId: reviewObjectId } } }
    );
    
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
