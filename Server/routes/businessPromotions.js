const express = require("express");
const router = express.Router();
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
router.post("/:promotionId/like", async (req, res) => {
  const { promotionId } = req.params;
  const { userId, fullName } = req.body;

  if (!userId || !fullName) {
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    promotion.likes = promotion.likes || [];

    const existingIndex = promotion.likes.findIndex(like => like.userId.toString() === userId);
    if (existingIndex > -1) {
      promotion.likes.splice(existingIndex, 1); // 💔 Unlike
    } else {
      promotion.likes.push({ userId, fullName, date: new Date() }); // ❤️ Like
    }

    await promotion.save();

    res.status(200).json({
      message: "Like toggled successfully",
      likes: promotion.likes,
    });
  } catch (error) {
    console.error("Error toggling promotion like:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 POST: Add a comment to a promotion
router.post("/:promotionId/comments", async (req, res) => {
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
        if (comment.replies?.length && addReplyRecursively(comment.replies)) return true;
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
router.post("/:promotionId/comments/:commentId/like", async (req, res) => {
  const { promotionId, commentId } = req.params;
  const { userId, fullName } = req.body;

  if (!userId || !fullName) {
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });

    let target = null;

    const findTargetComment = (comments) => {
      for (const c of comments) {
        if (c._id.toString() === commentId) return c;
        if (c.replies?.length) {
          const nested = findTargetComment(c.replies);
          if (nested) return nested;
        }
      }
      return null;
    };

    target = findTargetComment(promotion.comments || []);
    if (!target) return res.status(404).json({ message: "Comment or reply not found" });

    target.likes = target.likes || [];
    const index = target.likes.findIndex(l => l.userId.toString() === userId);

    if (index > -1) {
      target.likes.splice(index, 1); // 💔 Unlike
    } else {
      target.likes.push({ userId, fullName, date: new Date() }); // ❤️ Like
    }

    await promotion.save();

    res.status(200).json({
      message: "Like toggled successfully",
      likes: target.likes,
    });
  } catch (error) {
    console.error("Error toggling like:", error);
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

    const updateCommentRecursively = (comments) => {
      for (const c of comments) {
        if (c._id.toString() === commentId) {
          c.commentText = newText;
          return true;
        }
        if (c.replies?.length && updateCommentRecursively(c.replies)) return true;
      }
      return false;
    };

    const updated = updateCommentRecursively(promotion.comments || []);
    if (!updated) return res.status(404).json({ message: "Comment or reply not found" });

    promotion.updatedAt = new Date();
    await promotion.save();

    res.json({ message: "Comment updated successfully" });
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
