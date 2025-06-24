const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const Business = require("../models/Business");
const Promotion = require('../models/Promotions.js')
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const { extractTimeOnly } = require('../utils/extractTimeOnly.js');

// 📌 GET all promotions for a business using placeId
router.get('/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;
    const promotions = await Promotion.find({ placeId });

    const enhanced = await Promise.all(promotions.map(async promo => {
      const photos = await Promise.all((promo.photos || []).map(async (photo) => ({
        ...photo.toObject?.() ?? photo,
        url: await getPresignedUrl(photo.photoKey),
      })));

      return { ...promo.toObject(), photos };
    }));

    res.json(enhanced);
  } catch (err) {
    console.error('Error fetching promotions:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// 📌 POST: Create a new promotion and save it to a business
router.post('/', async (req, res) => {
  try {
    const {
      placeId,
      title,
      description,
      startDate,
      endDate,
      photos,
      recurring,
      recurringDays,
      isSingleDay,
      allDay,
      startTime,
      endTime,
    } = req.body;

    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const photoObjects = await Promise.all((photos || []).map(async (photo) => ({
      photoKey: photo.photoKey,
      uploadedBy: placeId,
      description: photo.description || null,
      uploadDate: new Date(),
    })));

    const newPromo = new Promotion({
      placeId,
      title,
      description,
      startDate,
      endDate,
      isSingleDay: isSingleDay ?? true,
      allDay: allDay ?? true,
      startTime: allDay ? null : extractTimeOnly(startTime),
      endTime: allDay ? null : extractTimeOnly(endTime),
      recurring: recurring ?? false,
      recurringDays: recurring ? recurringDays || [] : [],
      photos: photoObjects,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await newPromo.save();
    res.status(201).json({ message: 'Promotion created successfully', promotion: saved });
  } catch (err) {
    console.error('Error creating promotion:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// 📌 PUT: Edit promotion
router.put('/:promotionId', async (req, res) => {
  try {
    const { promotionId } = req.params;
    const {
      title,
      description,
      startDate,
      endDate,
      photos,
      recurring,
      recurringDays,
      isSingleDay,
      allDay,
      startTime,
      endTime,
    } = req.body;

    const updateFields = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (startDate !== undefined) updateFields.startDate = startDate;
    if (endDate !== undefined) updateFields.endDate = endDate;
    if (photos !== undefined) updateFields.photos = photos;
    if (recurring !== undefined) updateFields.recurring = recurring;
    if (recurring !== undefined && recurring) {
      updateFields.recurringDays = recurringDays || [];
    } else {
      updateFields.recurringDays = [];
    }
    if (isSingleDay !== undefined) updateFields.isSingleDay = isSingleDay;
    if (allDay !== undefined) {
      updateFields.allDay = allDay;
      updateFields.startTime = allDay ? null : startTime || null;
      updateFields.endTime = allDay ? null : endTime || null;
    }

    const updated = await Promotion.findByIdAndUpdate(promotionId, updateFields, { new: true });
    if (!updated) return res.status(404).json({ message: 'Promotion not found' });

    res.json({ message: 'Promotion updated successfully', promotion: updated });
  } catch (err) {
    console.error('Error updating promotion:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// 📌 DELETE: Remove promotion
router.delete('/:promotionId', async (req, res) => {
  try {
    const { promotionId } = req.params;
    const deleted = await Promotion.findByIdAndDelete(promotionId);

    if (!deleted) {
      return res.status(404).json({ message: 'Promotion not found' });
    }

    res.json({ message: 'Promotion deleted successfully' });
  } catch (err) {
    console.error('Error deleting promotion:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// 📌 DELETE: Remove a promotion by ID
router.delete("/:promotionId", async (req, res) => {
  try {
    const { promotionId } = req.params;

    const deleted = await Promotion.findByIdAndDelete(promotionId);
    if (!deleted) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    res.json({ message: "Promotion deleted successfully" });
  } catch (error) {
    console.error("Error deleting promotion:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 POST: Toggle like on a promotion
router.post("/:postId/like", async (req, res) => {
  const { postId } = req.params;
  const { userId, fullName } = req.body;

  const promotionId = postId;
  console.log("📥 Incoming like toggle request for promotion:", promotionId);
  console.log("👤 Requesting user:", { userId, fullName });

  if (!userId || !fullName) {
    console.warn("⚠️ Missing userId or fullName in request body.");
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      console.warn("❌ Promotion not found:", promotionId);
      return res.status(404).json({ message: "Promotion not found" });
    }

    promotion.likes = promotion.likes || [];

    const existingIndex = promotion.likes.findIndex(
      like => like.userId.toString() === userId
    );

    if (existingIndex > -1) {
      console.log(`💔 User ${userId} already liked this promotion — unliking.`);
      promotion.likes.splice(existingIndex, 1);
    } else {
      console.log(`❤️ User ${userId} has not liked this promotion — adding like.`);
      promotion.likes.push({ userId, fullName, date: new Date() });
    }

    await promotion.save();
    console.log("✅ Promotion like state saved successfully.");

    res.status(200).json({
      message: "Like toggled successfully",
      likes: promotion.likes,
    });
  } catch (error) {
    console.error("❌ Error toggling promotion like:", error.message, error.stack);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 POST: Add a comment to a promotion
router.post("/:promotionId/comment", async (req, res) => {
  const { promotionId } = req.params;
  const { userId, fullName, commentText } = req.body;

  if (!userId || !fullName || !commentText) {
    return res.status(400).json({ message: "Missing required fields: userId, fullName, commentText" });
  }

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      likes: [],
      replies: [],
    };

    promotion.comments = promotion.comments || [];
    promotion.comments.push(newComment);

    await promotion.save();

    const addedComment = promotion.comments[promotion.comments.length - 1];

    res.status(201).json({
      message: "Comment added successfully",
      comment: addedComment,
    });
  } catch (error) {
    console.error("Error adding comment to promotion:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 POST: Add a reply to a comment or nested reply
router.post("/:promotionId/comments/:commentId/replies", async (req, res) => {
  const { promotionId, commentId } = req.params;
  const { userId, fullName, commentText } = req.body;

  if (!userId || !fullName || !commentText) {
    return res.status(400).json({ message: "Missing required fields: userId, fullName, commentText" });
  }

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });

    const newReply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      likes: [],
      replies: [],
    };

    const addReplyRecursively = (comments) => {
      for (const comment of comments) {
        if (comment._id.toString() === commentId) {
          comment.replies.push(newReply);
          return true;
        }
        if (comment.replies?.length) {
          const found = addReplyRecursively(comment.replies);
          if (found) return true;
        }
      }
      return false;
    };

    const inserted = addReplyRecursively(promotion.comments || []);
    if (!inserted) {
      return res.status(404).json({ message: "Parent comment or reply not found" });
    }

    await promotion.save();

    res.status(201).json({
      message: "Reply added successfully",
      reply: newReply,
    });
  } catch (error) {
    console.error("Error adding reply:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 POST: Toggle like on a comment or reply
router.put("/:promotionId/comments/:commentId/like", async (req, res) => {
  const { promotionId, commentId } = req.params;
  const { userId, fullName } = req.body;

  console.log("📥 Incoming like request:", { promotionId, commentId, userId, fullName });

  if (!userId || !fullName) {
    console.warn("⚠️ Missing userId or fullName in request body");
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      console.warn(`❌ Promotion not found with ID: ${promotionId}`);
      return res.status(404).json({ message: "Promotion not found" });
    }

    console.log(`🔍 Searching for comment ${commentId} in promotion ${promotion._id}`);

    const findTargetComment = (comments, depth = 0) => {
      for (const c of comments) {
        console.log(`${' '.repeat(depth * 2)}🧵 Checking comment ID: ${c._id}`);
        if (c._id.toString() === commentId) {
          console.log(`${' '.repeat(depth * 2)}✅ Found target comment`);
          return c;
        }
        if (c.replies?.length) {
          const nested = findTargetComment(c.replies, depth + 1);
          if (nested) return nested;
        }
      }
      return null;
    };

    const target = findTargetComment(promotion.comments || []);
    if (!target) {
      console.warn(`❌ Comment or reply with ID ${commentId} not found`);
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    target.likes = target.likes || [];
    const index = target.likes.findIndex(l => l.userId.toString() === userId);
    console.log(`❤️ Current likes: ${target.likes.length}, Index of user: ${index}`);

    if (index > -1) {
      console.log("💔 User already liked. Removing like...");
      target.likes.splice(index, 1); // Unlike
    } else {
      console.log("❤️ User has not liked. Adding like...");
      target.likes.push({ userId, fullName, date: new Date() }); // Like
    }

    await promotion.save();
    console.log("✅ Promotion saved successfully with updated likes");

    res.status(200).json({
      message: "Like toggled successfully",
      likes: target.likes,
    });
  } catch (error) {
    console.error("❌ Error toggling like:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 PATCH: Edit a comment or reply
router.patch("/:promotionId/edit-comment/:commentId", async (req, res) => {
  const { promotionId, commentId } = req.params;
  const { newText } = req.body;

  if (!newText || newText.trim() === "") {
    return res.status(400).json({ message: "New comment text is required" });
  }

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });

    let updatedComment = null;

    const updateCommentRecursively = (comments) => {
      for (const c of comments) {
        if (c._id.toString() === commentId) {
          c.commentText = newText;
          updatedComment = {
            _id: c._id,
            userId: c.userId,
            fullName: c.fullName,
            commentText: newText,
            createdAt: c.createdAt,
            updatedAt: new Date(),
            likes: c.likes || [],
            replies: c.replies || []
          };
          return true;
        }
        if (c.replies?.length && updateCommentRecursively(c.replies)) return true;
      }
      return false;
    };

    const found = updateCommentRecursively(promotion.comments || []);
    if (!found) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    promotion.updatedAt = new Date();
    await promotion.save();

    res.json({
      message: "Comment updated successfully",
      updatedComment
    });
  } catch (error) {
    console.error("Error editing comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 🧹 DELETE: Remove a comment or reply from a promotion
router.delete("/:promotionId/delete-comment/:commentId", async (req, res) => {
  const { promotionId, commentId } = req.params;

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    const originalLength = JSON.stringify(promotion.comments || []).length;

    const deleteNestedComment = (comments = [], targetId) => {
      return comments
        .map(comment => {
          if (comment._id.toString() === targetId) return null;
          if (comment.replies?.length) {
            comment.replies = deleteNestedComment(comment.replies, targetId);
          }
          return comment;
        })
        .filter(Boolean);
    };

    promotion.comments = deleteNestedComment(promotion.comments || [], commentId);

    const newLength = JSON.stringify(promotion.comments).length;
    if (originalLength === newLength) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    promotion.updatedAt = new Date();
    await promotion.save();

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting promotion comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
