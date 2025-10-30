const express = require('express');
const router = express.Router();
const SharedPost = require('../models/SharedPost');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const Business = require('../models/Business');
const { resolveUserProfilePics, enrichSharedPost } = require('../utils/userPosts');
const { getModelByType } = require('../utils/getModelByType.js');

// ✅ CREATE a shared post
router.post('/', verifyToken, async (req, res) => {
  try {
    const { postType, originalPostId, caption } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Validate postType
    const ALLOWED = ['review', 'check-in', 'invite', 'promotion', 'event'];
    if (!ALLOWED.includes(postType)) {
      return res.status(400).json({ error: 'Invalid postType' });
    }

    // Verify original exists and load minimal fields needed to resolve originalOwner
    const Model = getModelByType(postType);
    if (!Model) return res.status(400).json({ error: 'Unsupported postType' });

    const original = await Model.findById(originalPostId).lean();
    if (!original) return res.status(404).json({ error: 'Original post not found' });

    // Resolve original owner so the SharedPost document is valid
    let originalOwner = null;
    let originalOwnerModel = null;

    if (postType === 'invite') {
      originalOwner = original.senderId;
      originalOwnerModel = 'User';
      if (!originalOwner) {
        return res.status(500).json({ error: 'Invite is missing senderId' });
      }
    } else if (postType === 'review' || postType === 'check-in') {
      originalOwner = original.userId || original.user || null;
      originalOwnerModel = 'User';
      if (!originalOwner) {
        return res.status(500).json({ error: `${postType} is missing user` });
      }
    } else {
      // promotion | event
      const placeId = original.placeId || original.business?.placeId || null;
      if (!placeId) return res.status(500).json({ error: 'Promotion or Event is missing placeId' });

      const business = await Business.findOne({ placeId }).select('_id').lean();
      if (!business) return res.status(404).json({ error: 'Business not found for this promotion/event' });

      originalOwner = business._id;
      originalOwnerModel = 'Business';
    }

    // Create the shared post record
    const sharedPost = await SharedPost.create({
      user: userId,
      originalOwner,
      originalOwnerModel,
      postType,
      originalPostId,
      caption,
    });

    // Resolve just the pics we need and let enrichSharedPost do the rest
    const profilePicTargets = [
      sharedPost.user.toString(),
      originalOwnerModel === 'User' ? sharedPost.originalOwner.toString() : null,
    ].filter(Boolean);

    const profilePicMap = await resolveUserProfilePics(profilePicTargets);

    // Centralized enrichment (covers invites + promo/event banner fallback)
    const sharer = await User.findById(userId)
      .select('firstName lastName profilePic businessName placeId logoKey accountType __t')
      .lean();

    const enriched = await enrichSharedPost(
      { ...sharedPost.toObject(), user: sharer },
      profilePicMap
    );

    // Respond in the shape your clients already consume
    // (Keep the Mongo doc fields for consistency; override/augment with enriched blocks)
    return res.status(201).json({
      ...sharedPost.toObject(),
      type: 'sharedPost',
      // Use enriched blocks (these already include union/user/business shaping and media fallback)
      user: enriched.user,
      originalOwner: enriched.originalOwner,
      original: enriched.original,
    });
  } catch (err) {
    console.error('❌ Error creating shared post:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit a shared post
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { caption } = req.body;

    const sharedPost = await SharedPost.findById(req.params.id);
    if (!sharedPost) return res.status(404).json({ message: 'Shared post not found' });

    if (sharedPost.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to edit this post' });
    }

    sharedPost.caption = caption || '';
    await sharedPost.save();

    res.json(sharedPost);
  } catch (err) {
    console.error('[EditSharedPost] Error:', err);
    res.status(500).json({ message: 'Server error editing shared post' });
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
