const express = require('express');
const router = express.Router();
const SharedPost = require('../models/SharedPost');
const verifyToken = require('../middleware/verifyToken');
const Review = require('../models/Reviews');
const CheckIn = require('../models/CheckIns');
const Business = require('../models/Business');
const ActivityInvite = require('../models/ActivityInvites');
const Promotion = require('../models/Promotions');
const Event = require('../models/Events');
const { resolveUserProfilePics, enrichSharedPost } = require('../utils/userPosts');

// Utility to map postType to model
const getModelByType = (type) => {
  switch (type) {
    case 'review': return Review;
    case 'check-in': return CheckIn;
    case 'invite': return ActivityInvite;
    case 'promotion': return Promotion;
    case 'promo': return Promotion;
    case 'event': return Event;
    default: return null;
  }
};

// ✅ CREATE a shared post
router.post('/', verifyToken, async (req, res) => {
  try {
    const { postType, originalPostId, caption } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!['review', 'check-in', 'invite', 'promotion', 'event'].includes(postType)) {
      return res.status(400).json({ error: 'Invalid postType' });
    }

    const Model = getModelByType(postType);
    const original = await Model.findById(originalPostId);
    if (!original) {
      console.warn('⚠️ Original post not found:', originalPostId);
      return res.status(404).json({ error: 'Original post not found' });
    }

    let originalOwnerId;
    let originalOwnerModel;

    if (['review', 'check-in', 'invite'].includes(postType)) {
      originalOwnerId = original.userId;
      originalOwnerModel = 'User';
    } else if (['promotion', 'event'].includes(postType)) {
      const placeId = original.placeId;
      if (!placeId) {
        console.warn('⚠️ Missing placeId on original promotion/event post');
        return res.status(500).json({ error: 'Promotion or Event is missing placeId' });
      }

      const business = await Business.findOne({ placeId });
      if (!business) {
        console.warn('⚠️ Business not found for placeId:', placeId);
        return res.status(404).json({ error: 'Business not found for this promotion/event' });
      }

      originalOwnerId = business._id;
      originalOwnerModel = 'Business';
    }

    const sharedPost = await SharedPost.create({
      user: userId,
      originalOwner: originalOwnerId,
      originalOwnerModel,
      postType,
      originalPostId,
      caption,
    });

    const profilePicMap = await resolveUserProfilePics([
      sharedPost.user.toString(),
      originalOwnerModel === 'User' ? sharedPost.originalOwnerId.toString() : null,
    ].filter(Boolean));

    const enrichedOriginal = await enrichSharedPost(sharedPost, profilePicMap);

    res.status(201).json({
      ...sharedPost.toObject(),
      user: {
        id: userId,
        ...profilePicMap[userId.toString()],
      },
      originalOwner: {
        id: sharedPost.originalOwner,
        model: originalOwnerModel,
        ...(originalOwnerModel === 'User'
          ? profilePicMap[sharedPost.originalOwner.toString()]
          : {}), // skip photo info for businesses
      },
      original: enrichedOriginal,
      type: 'sharedPost',
    });
  } catch (err) {
    console.error('❌ Error creating shared post:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ GET a single shared post by ID
router.get('/:sharedPostId', verifyToken, async (req, res) => {
  try {
    const { sharedPostId } = req.params;

    const sharedPost = await SharedPost.findById(sharedPostId)
      .populate('user', 'firstName lastName profilePic')
      .populate('originalOwner', 'firstName lastName profilePic')
      .lean();

    if (!sharedPost) {
      return res.status(404).json({ error: 'Shared post not found' });
    }

    const profilePicMap = await resolveUserProfilePics([
      sharedPost.user?._id?.toString(),
      sharedPost.originalOwner?._id?.toString(),
    ]);

    const enrichedOriginal = await enrichSharedPost(sharedPost, profilePicMap);

    res.status(200).json({
      ...sharedPost,
      user: {
        ...sharedPost.user,
        profilePic: profilePicMap[sharedPost.user._id?.toString()]?.profilePic || null,
        profilePicUrl: profilePicMap[sharedPost.user._id?.toString()]?.profilePicUrl || null,
      },
      originalOwner: {
        ...sharedPost.originalOwner,
        profilePic: profilePicMap[sharedPost.originalOwner._id?.toString()]?.profilePic || null,
        profilePicUrl: profilePicMap[sharedPost.originalOwner._id?.toString()]?.profilePicUrl || null,
      },
      original: enrichedOriginal,
      type: 'sharedPost',
    });
  } catch (err) {
    console.error('Error fetching shared post by ID:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//toggle like
router.post("/:postId/like", verifyToken, async (req, res) => {
  const { postId } = req.params;
  const { userId, fullName } = req.body;

  if (!userId || !fullName) {
    console.warn("⚠️ Missing userId or fullName in request body.");
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const sharedPost = await SharedPost.findById(postId);
    if (!sharedPost) {
      return res.status(404).json({ message: "Shared post not found" });
    }

    sharedPost.likes = sharedPost.likes || [];
    const existingIndex = sharedPost.likes.findIndex(like => like.userId.toString() === userId);
    const isUnliking = existingIndex > -1;

    if (isUnliking) {
      sharedPost.likes.splice(existingIndex, 1);
    } else {
      sharedPost.likes.push({
        userId,
        fullName,
        date: new Date(),
      });
    }

    await sharedPost.save();

    res.status(200).json({
      message: "Like toggled successfully",
      likes: sharedPost.likes,
    });
  } catch (error) {
    console.error("❌ Error toggling shared post like:", error.message, error.stack);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ GET shared posts by user
router.get('/by-user/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const sharedPosts = await SharedPost.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePic')
      .populate('originalOwner', 'username profilePic')
      .lean();

    // Optionally include original post content
    const results = await Promise.all(sharedPosts.map(async (post) => {
      const Model = getModelByType(post.postType);
      const original = await Model.findById(post.originalPostId).lean();
      return { ...post, original };
    }));

    res.json(results);
  } catch (err) {
    console.error('Error fetching shared posts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ DELETE a shared post
router.delete('/:sharedPostId', verifyToken, async (req, res) => {
  try {
    const { sharedPostId } = req.params;
    const userId = req.user.id;

    const post = await SharedPost.findById(sharedPostId);

    if (!post) {
      return res.status(404).json({ error: 'Shared post not found' });
    }

    if (!post.user.equals(userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await SharedPost.deleteOne({ _id: sharedPostId });
    
    res.status(200).json({ message: 'Shared post deleted' });
  } catch (err) {
    console.error('❌ Error deleting shared post:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
