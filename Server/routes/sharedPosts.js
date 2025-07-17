const express = require('express');
const router = express.Router();
const SharedPost = require('../models/SharedPost');
const verifyToken = require('../middleware/verifyToken');
const Review = require('../models/Reviews');
const CheckIn = require('../models/CheckIns');
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
    case 'event': return Event;
    default: return null;
  }
};

// ✅ CREATE a shared post
router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('📥 Incoming shared post request:', req.body);

    const { postType, originalPostId, caption } = req.body;
    const userId = req.user?.id;
    console.log('👤 Authenticated user:', userId);

    if (!userId) {
      console.warn('⚠️ No user ID found in token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!['review', 'check-in', 'invite', 'promotion', 'event'].includes(postType)) {
      console.warn('⚠️ Invalid postType:', postType);
      return res.status(400).json({ error: 'Invalid postType' });
    }

    const Model = getModelByType(postType);
    console.log('📘 Resolved model for postType:', postType);

    const original = await Model.findById(originalPostId);
    if (!original) {
      console.warn('⚠️ Original post not found:', originalPostId);
      return res.status(404).json({ error: 'Original post not found' });
    }

    console.log('✅ Found original post:', original._id);

    // 🧠 Determine originalOwner based on postType
    let originalOwner;

    switch (postType) {
      case 'review':
      case 'check-in':
      case 'invite':
        originalOwner = original.userId;
        break;
      case 'promotion':
      case 'event':
        originalOwner = original.placeId;
        break;
      default:
        return res.status(400).json({ error: 'Unsupported postType for ownership resolution' });
    }

    if (!originalOwner) {
      console.warn('⚠️ Could not resolve originalOwner for post:', original._id);
      return res.status(500).json({ error: 'Unable to determine original owner of post' });
    }

    const sharedPost = await SharedPost.create({
      user: userId,
      originalOwner,
      postType,
      originalPostId,
      caption,
    });

    console.log('📝 Created shared post:', sharedPost._id);

    const profilePicMap = await resolveUserProfilePics([
      sharedPost.user.toString(),
      sharedPost.originalOwner.toString(),
    ]);
    console.log('🧠 Profile pics resolved');

    const enrichedOriginal = await enrichSharedPost(sharedPost, profilePicMap);
    console.log('🔗 Enriched original post');

    res.status(201).json({
      ...sharedPost.toObject(), // 👈 important to use .toObject() to avoid Mongoose prototype in response
      user: {
        _id: userId,
        ...profilePicMap[userId.toString()],
      },
      originalOwner: {
        _id: sharedPost.originalOwner,
        ...profilePicMap[sharedPost.originalOwner.toString()],
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
    const userId = req.user._id;

    const post = await SharedPost.findById(sharedPostId);
    if (!post) return res.status(404).json({ error: 'Shared post not found' });
    if (!post.user.equals(userId)) return res.status(403).json({ error: 'Not authorized' });

    await post.remove();
    res.status(200).json({ message: 'Shared post deleted' });
  } catch (err) {
    console.error('Error deleting shared post:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
