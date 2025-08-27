const express = require('express');
const router = express.Router();
const SharedPost = require('../models/SharedPost');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const Business = require('../models/Business');
const { resolveUserProfilePics, enrichSharedPost } = require('../utils/userPosts');
const { getModelByType } = require('../utils/getModelByType.js');
const { toInviteUserShape, toInviteRecipientsShape, lookupBusinessBits } = require('../utils/invites/enrichInviteBits.js');

// ✅ CREATE a shared post
router.post('/', verifyToken, async (req, res) => {
  try {
    const { postType, originalPostId, caption } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!['review', 'check-in', 'invite', 'promotion', 'event'].includes(postType)) {
      return res.status(400).json({ error: 'Invalid postType' });
    }

    const Model = getModelByType(postType); // ⬅️ make sure 'invite' maps to ActivityInvite
    const original = await Model.findById(originalPostId);
    if (!original) {
      return res.status(404).json({ error: 'Original post not found' });
    }

    // ---------- Resolve original owner ----------
    let originalOwner = null;
    let originalOwnerModel = null;

    if (postType === 'invite') {
      // ✅ Your schema: owner is the user that created the invite
      originalOwner = original.senderId; // ObjectId(User)
      originalOwnerModel = 'User';

      if (!originalOwner) {
        return res.status(500).json({ error: 'Invite is missing senderId' });
      }
    } else if (postType === 'review' || postType === 'check-in') {
      originalOwner = original?.userId || original?.user || null; // User
      originalOwnerModel = 'User';
      if (!originalOwner) return res.status(500).json({ error: `${postType} is missing user` });
    } else if (postType === 'promotion' || postType === 'event') {
      const placeId = original?.placeId || original?.business?.placeId || null;
      if (!placeId) return res.status(500).json({ error: 'Promotion or Event is missing placeId' });

      const business = await Business.findOne({ placeId });
      if (!business) return res.status(404).json({ error: 'Business not found for this promotion/event' });

      originalOwner = business._id;       // Business
      originalOwnerModel = 'Business';
    }

    // ---------- Create shared post ----------
    const sharedPost = await SharedPost.create({
      user: userId,
      originalOwner,
      originalOwnerModel,
      postType,
      originalPostId,
      caption,
    });

    // ---------- Enrich envelope (current user + owner pic) ----------
    const userDoc = await User.findById(userId).lean();
    const isBusinessUser = !!userDoc?.businessName;

    const profilePicTargets = [
      sharedPost.user.toString(),
      originalOwnerModel === 'User' ? sharedPost.originalOwner.toString() : null,
    ].filter(Boolean);

    const profilePicMap = await resolveUserProfilePics(profilePicTargets);

    // ---------- Enrich "original" for invites using YOUR HELPERS ----------
    let enrichedOriginal;
    if (postType === 'invite') {
      // Sender
      const sender = await toInviteUserShape(original.senderId);
      // Recipients
      const recipients = await toInviteRecipientsShape(original.recipients || []);
      // Business bits
      const { businessName, businessLogoUrl } = await lookupBusinessBits(original.placeId);

      enrichedOriginal = {
        __typename: 'ActivityInvite',
        _id: original._id.toString(),
        type: 'invite',
        sender,                 // { id, firstName, lastName, profilePicUrl }
        recipients,             // [{ user: {…}, status }]
        businessName,
        businessLogoUrl,
        placeId: original.placeId,
        dateTime: original.dateTime,
        note: original.note || '',
        message: original.message || '',
        isPublic: !!original.isPublic,
        likes: original.likes || [],
        comments: original.comments || [],
        requests: original.requests || [],
        createdAt: original.createdAt,
        sortDate: original.createdAt,     // or keep a dedicated sortDate if you have one
        status: original.status || 'pending',
      };
    } else {
      // keep your existing enrichment for non-invites
      const enriched = await enrichSharedPost(sharedPost, profilePicMap);
      enrichedOriginal = enriched.original;
    }

    // ---------- Respond ----------
    return res.status(201).json({
      ...sharedPost.toObject(),
      user: {
        id: userId,
        ...(isBusinessUser
          ? { businessName: userDoc.businessName }
          : { firstName: userDoc?.firstName || '', lastName: userDoc?.lastName || '' }),
        ...profilePicMap[userId.toString()],
      },
      originalOwner: {
        id: sharedPost.originalOwner,
        model: originalOwnerModel,
        ...(originalOwnerModel === 'User'
          ? profilePicMap[sharedPost.originalOwner.toString()]
          : {}),
      },
      original: enrichedOriginal, // ✅ invite payload your UI expects
      type: 'sharedPost',
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
