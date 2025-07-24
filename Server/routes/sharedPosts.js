const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const SharedPost = require('../models/SharedPost');
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const Business = require('../models/Business');
const deleteS3Objects = require('../utils/deleteS3Objects.js');
const { resolveUserProfilePics, enrichSharedPost } = require('../utils/userPosts');
const { getModelByType } = require('../utils/getModelByType.js')

// ✅ CREATE a shared post
router.post('/', verifyToken, async (req, res) => {
  try {
    const { postType, originalPostId, caption } = req.body;
    const userId = req.user?.id;

    console.log(postType);

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

    let originalOwner;
    let originalOwnerModel;

    if (['review', 'check-in', 'invite'].includes(postType)) {
      originalOwner = original.userId;
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

      originalOwner = business._id;
      originalOwnerModel = 'Business';
    }

    const sharedPost = await SharedPost.create({
      user: userId,
      originalOwner,
      originalOwnerModel,
      postType,
      originalPostId,
      caption,
    });

    // Fetch user or business user info
    const userDoc = await User.findById(userId).lean();
    const isBusinessUser = !!userDoc?.businessName;

    const profilePicMap = await resolveUserProfilePics([
      sharedPost.user.toString(),
      originalOwnerModel === 'User' ? sharedPost.originalOwner.toString() : null,
    ].filter(Boolean));

    const enrichedOriginal = await enrichSharedPost(sharedPost, profilePicMap);

    res.status(201).json({
      ...sharedPost.toObject(),
      user: {
        id: userId,
        ...(isBusinessUser
          ? {
            businessName: userDoc.businessName,
          }
          : {
            firstName: userDoc?.firstName || '',
            lastName: userDoc?.lastName || '',
          }),
        ...profilePicMap[userId.toString()],
      },
      originalOwner: {
        id: sharedPost.originalOwner,
        model: originalOwnerModel,
        ...(originalOwnerModel === 'User'
          ? profilePicMap[sharedPost.originalOwner.toString()]
          : {}),
      },
      original: enrichedOriginal.original,
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

// POST: Add a comment to a shared post
router.post("/:sharedPostId/comment", async (req, res) => {
  const { sharedPostId } = req.params;
  const { userId, fullName, commentText, media } = req.body;

  const mediaPayload = media?.photoKey && media?.mediaType
    ? {
      photoKey: media.photoKey,
      mediaType: ["image", "video"].includes(media.mediaType) ? media.mediaType : null,
    }
    : { photoKey: null, mediaType: null };

  try {
    const post = await SharedPost.findById(sharedPostId);
    if (!post) return res.status(404).json({ message: "Shared post not found" });

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      likes: [],
      replies: [],
      media: mediaPayload,
    };

    post.comments = post.comments || [];
    post.comments.push(newComment);
    await post.save();

    const presignedUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;

    res.status(201).json({
      message: "Comment added successfully",
      comment: {
        ...newComment,
        media: mediaPayload.photoKey ? {
          ...mediaPayload,
          mediaUrl: presignedUrl
        } : null
      }
    });
  } catch (error) {
    console.error("Error adding comment to shared post:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// POST: Add a reply to a comment/reply
router.post("/:sharedPostId/comments/:commentId/replies", async (req, res) => {
  const { sharedPostId, commentId } = req.params;
  const { userId, fullName, commentText, media } = req.body;

  const mediaPayload = media?.photoKey && media?.mediaType
    ? {
      photoKey: media.photoKey,
      mediaType: ["image", "video"].includes(media.mediaType) ? media.mediaType : null,
    }
    : { photoKey: null, mediaType: null };

  try {
    const post = await SharedPost.findById(sharedPostId);
    if (!post) return res.status(404).json({ message: "Shared post not found" });

    const newReply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      likes: [],
      replies: [],
      media: mediaPayload
    };

    let inserted = false;
    const addNestedReply = (repliesArray, targetId) => {
      for (const reply of repliesArray) {
        if (reply._id.toString() === targetId) {
          reply.replies.push(newReply);
          return true;
        }
        if (reply.replies?.length) {
          if (addNestedReply(reply.replies, targetId)) return true;
        }
      }
      return false;
    };

    const parentComment = post.comments.id(commentId);
    if (parentComment) {
      parentComment.replies.push(newReply);
      inserted = true;
    } else {
      for (const comment of post.comments || []) {
        if (addNestedReply(comment.replies, commentId)) {
          inserted = true;
          break;
        }
      }
    }

    if (!inserted) return res.status(404).json({ message: "Parent comment or reply not found" });

    await post.save();

    const presignedUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;

    res.status(201).json({
      message: "Reply added successfully",
      reply: {
        ...newReply,
        media: mediaPayload.photoKey ? {
          ...mediaPayload,
          mediaUrl: presignedUrl
        } : null
      }
    });
  } catch (error) {
    console.error("Error adding reply to shared post:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.patch("/:sharedPostId/edit-comment/:commentId", async (req, res) => {
  const { sharedPostId, commentId } = req.params;
  const { newText, media } = req.body;

  const mediaPayload = media?.photoKey && media?.mediaType
    ? {
      photoKey: media.photoKey,
      mediaType: ['image', 'video'].includes(media.mediaType) ? media.mediaType : null,
    }
    : { photoKey: null, mediaType: null };

  try {
    const post = await SharedPost.findById(sharedPostId);
    if (!post) return res.status(404).json({ message: "Shared post not found" });

    let updatedComment = null;
    let oldPhotoKeyToDelete = null;

    const updateRecursively = (comments) => {
      for (const c of comments) {
        if (c._id.toString() === commentId) {
          if (c.media?.photoKey && c.media.photoKey !== mediaPayload.photoKey) {
            oldPhotoKeyToDelete = c.media.photoKey;
          }
          c.commentText = newText;
          c.media = mediaPayload;
          updatedComment = { ...c.toObject?.() || c };
          return true;
        }
        if (c.replies?.length && updateRecursively(c.replies)) return true;
      }
      return false;
    };

    const found = updateRecursively(post.comments || []);
    if (!found) return res.status(404).json({ message: "Comment or reply not found" });

    await post.save();
    if (oldPhotoKeyToDelete) await deleteS3Objects([oldPhotoKeyToDelete]);

    const presignedUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;

    res.json({
      message: "Comment updated successfully",
      updatedComment: {
        ...updatedComment,
        media: mediaPayload.photoKey ? {
          ...mediaPayload,
          mediaUrl: presignedUrl
        } : null
      }
    });
  } catch (error) {
    console.error("Error editing comment on shared post:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.put("/:sharedPostId/comments/:commentId/like", async (req, res) => {
  const { sharedPostId, commentId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const user = await User.findById(userId).select('firstName lastName');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const fullName = `${user.firstName} ${user.lastName}`;
    const post = await SharedPost.findById(sharedPostId);
    if (!post) return res.status(404).json({ message: "Shared post not found" });

    let target = null;

    const findRecursively = (comments) => {
      for (const c of comments) {
        if (c._id.toString() === commentId) return c;
        if (c.replies?.length) {
          const found = findRecursively(c.replies);
          if (found) return found;
        }
      }
      return null;
    };

    target = findRecursively(post.comments || []);
    if (!target) return res.status(404).json({ message: "Comment or reply not found" });

    target.likes = target.likes || [];
    const idx = target.likes.findIndex(l => l.userId.toString() === userId);
    if (idx !== -1) {
      target.likes.splice(idx, 1); // unlike
    } else {
      target.likes.push({ userId, fullName, date: new Date() }); // like
    }

    await post.save();

    res.status(200).json({ message: "Like toggled successfully", likes: target.likes });
  } catch (error) {
    console.error("Error toggling like on shared post comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/:sharedPostId/delete-comment/:commentId", async (req, res) => {
  const { sharedPostId, commentId } = req.params;

  let mediaKeyToDelete = null;

  const deleteNested = (comments) => {
    return comments
      .map(c => {
        if (c._id.toString() === commentId) {
          if (c.media?.photoKey) mediaKeyToDelete = c.media.photoKey;
          return null;
        }
        if (c.replies?.length) {
          c.replies = deleteNested(c.replies);
        }
        return c;
      })
      .filter(Boolean);
  };

  try {
    const post = await SharedPost.findById(sharedPostId);
    if (!post) return res.status(404).json({ message: "Shared post not found" });

    const originalLength = JSON.stringify(post.comments || []).length;
    post.comments = deleteNested(post.comments || []);
    const newLength = JSON.stringify(post.comments).length;

    if (originalLength === newLength) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    await post.save();
    if (mediaKeyToDelete) await deleteS3Objects([mediaKeyToDelete]);

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment on shared post:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
