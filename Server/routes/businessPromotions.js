const express = require("express");
const router = express.Router();
const mongoose = require('mongoose');
const Business = require("../models/Business");
const Promotion = require('../models/Promotions.js')
const User = require('../models/User.js');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const { extractTimeOnly } = require('../utils/extractTimeOnly.js');
const deleteS3Objects = require('../utils/deleteS3Objects.js');
const { enrichComments } = require('../utils/userPosts.js');
const { isPromoActive, isPromoLaterToday } = require('../utils/enrichBusinesses.js');

router.get("/promotion/:promotionId", async (req, res) => {
  const { promotionId } = req.params;

  try {
    const promo = await Promotion.findById(promotionId).lean();

    if (!promo) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    // Get time context
    const now = new Date();
    const nowLocal = DateTime.fromJSDate(now).toLocal();
    const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;

    // Determine kind
    let kind = "inactivePromo";
    if (isPromoActive(promo, nowMinutes, now)) {
      kind = "activePromo";
    } else if (isPromoLaterToday(promo, nowMinutes, now)) {
      kind = "upcomingPromo";
    }

    // Enrich comments
    const enrichedComments = await enrichComments(promo.comments || []);

    // Enrich photos
    const enrichedPhotos = await Promise.all(
      (promo.photos || []).map(async (photo) => {
        const url = await getPresignedUrl(photo.key);
        return { ...photo, url };
      })
    );

    // Get business name
    let businessName = null;
    if (promo.placeId) {
      const business = await Business.findOne({ placeId: promo.placeId }).lean();
      businessName = business?.businessName || null;
    }

    // Final enriched promotion object
    const enrichedPromo = {
      ...promo,
      kind,
      comments: enrichedComments,
      photos: enrichedPhotos,
      businessName,
    };

    res.json({ promotion: enrichedPromo });
  } catch (error) {
    console.error("Error fetching promotion:", error);
    res.status(500).json({ message: "Server error fetching promotion" });
  }
});

// 📌 GET all promotions for a business using placeId
router.get('/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;
    
    const business = await Business.findOne({ placeId }).lean();
    if (!business) {
      console.warn(`⚠️ Business not found for placeId: ${placeId}`);
      return res.status(404).json({ message: 'Business not found' });
    }
    
    const promotions = await Promotion.find({ placeId }).lean();
    
    const enhanced = await Promise.all(promotions.map(async (promo, index) => {
      const photos = await Promise.all((promo.photos || []).map(async (photo, i) => {
        if (!photo?.photoKey) {
          console.warn(`⚠️ Promo ${promo._id} has invalid photo at index ${i}`);
          return { ...photo, url: null };
        }

        try {
          const url = await getPresignedUrl(photo.photoKey);
          return { ...photo, url };
        } catch (err) {
          console.error(`❌ Failed to get presigned URL for photoKey: ${photo.photoKey}`, err);
          return { ...photo, url: null };
        }
      }));

      return {
        ...promo,
        photos,
        kind: 'promo',
        ownerId: business._id?.toString?.() || null,
        businessName: business.businessName || 'Unknown',
      };
    }));

    res.json(enhanced);
  } catch (err) {
    console.error('🔥 Unexpected error in GET /:placeId promotions route:', err);
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
    const promoWithKind = saved.toObject();
    promoWithKind.kind = "Promo";
    promoWithKind.ownerId = business._id;

    res.status(201).json({ message: 'Promotion created successfully', promotion: promoWithKind });
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

    const updateFields = { updatedAt: new Date() };

    // 🧠 Loop over simple fields
    const simpleFields = {
      title,
      description,
      startDate,
      endDate,
      isSingleDay,
      recurring,
      allDay,
    };

    Object.entries(simpleFields).forEach(([key, value]) => {
      if (value !== undefined) updateFields[key] = value;
    });

    // 🔁 Handle recurringDays
    if (recurring !== undefined) {
      updateFields.recurringDays = recurring ? recurringDays || [] : [];
    }

    // ⏱ Handle time window
    if (allDay !== undefined) {
      updateFields.startTime = allDay ? null : startTime || null;
      updateFields.endTime = allDay ? null : endTime || null;
    }

    // 🖼 Optionally enrich photos if needed (add getPresignedUrl if relevant)
    if (photos !== undefined) {
      updateFields.photos = await Promise.all(
        photos.map(async (photo) => ({
          ...photo,
          url: await getPresignedUrl(photo.photoKey),
        }))
      );
    }

    const updated = await Promotion.findByIdAndUpdate(promotionId, updateFields, { new: true });
    if (!updated) return res.status(404).json({ message: 'Promotion not found' });

    res.json({
      message: 'Promotion updated successfully',
      promotion: {
        ...updated.toObject(),
        kind: 'Promo',
        ownerId: updated.uploadedBy || null, // fallback if not in doc
      },
    });
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

  if (!userId || !fullName) {
    console.warn("⚠️ Missing userId or fullName in request body.");
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const promotion = await Promotion.findById(postId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    const placeId = promotion.placeId;
    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    promotion.likes = promotion.likes || [];
    const existingIndex = promotion.likes.findIndex(like => like.userId.toString() === userId);
    const isUnliking = existingIndex > -1;

    let promoModified = false;
    let businessModified = false;

    const notificationMatch = (n) =>
      n.type === 'like' &&
      n.relatedId?.toString() === userId &&
      n.targetId?.toString() === postId &&
      n.postType === 'promotion';

    if (isUnliking) {
      promotion.likes.splice(existingIndex, 1);
      promoModified = true;

      const notifIndex = business.notifications.findIndex(notificationMatch);
      if (notifIndex !== -1) {
        business.notifications.splice(notifIndex, 1);
        businessModified = true;
      }
    } else {
      promotion.likes.push({ userId, fullName, date: new Date() });
      promoModified = true;

      // ✅ Notification creation intentionally skipped
    }

    await Promise.all([
      promoModified ? promotion.save() : null,
      businessModified ? business.save() : null
    ]);

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
  const { userId, fullName, commentText, media } = req.body;

  const mediaPayload = media?.photoKey && media?.mediaType
    ? {
        photoKey: media.photoKey,
        mediaType: ['image', 'video'].includes(media.mediaType) ? media.mediaType : null
      }
    : { photoKey: null, mediaType: null };

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });

    const business = await Business.findOne({ placeId: promotion.placeId });
    if (!business) return res.status(404).json({ message: "Business not found for this promotion" });

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

    promotion.comments = promotion.comments || [];
    promotion.comments.push(newComment);
    await promotion.save();

    const addedComment = promotion.comments[promotion.comments.length - 1];

    const isBusinessCommenting = userId === business._id.toString();
    if (!isBusinessCommenting) {
      const alreadyNotified = business.notifications.some(
        (n) =>
          n.type === 'comment' &&
          n.relatedId?.toString() === userId &&
          n.typeRef === 'User' &&
          n.targetId?.toString() === promotionId &&
          n.commentId?.toString() === newComment._id.toString() &&
          n.postType === 'promotion'
      );

      if (!alreadyNotified) {
        business.notifications.push({
          type: 'comment',
          message: `${fullName} commented on your promotion`,
          relatedId: userId,
          typeRef: 'User',
          targetId: promotionId,
          targetRef: null,
          commentId: newComment._id,
          read: false,
          postType: 'promotion',
          createdAt: new Date()
        });
        await business.save();
      }
    }

    const presignedUrl = mediaPayload.photoKey ? await getPresignedUrl(mediaPayload.photoKey) : null;

    res.status(201).json({
      message: "Comment added successfully",
      comment: {
        ...addedComment.toObject?.() || addedComment,
        media: mediaPayload.photoKey ? {
          ...mediaPayload,
          mediaUrl: presignedUrl
        } : null
      }
    });
  } catch (error) {
    console.error("Error adding comment to promotion:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/:promotionId/comments/:commentId/replies", async (req, res) => {
  const { promotionId, commentId } = req.params;
  const { userId, fullName, commentText, media } = req.body;
  
  const mediaPayload = media?.photoKey && media?.mediaType
    ? {
        photoKey: media.photoKey,
        mediaType: ['image', 'video'].includes(media.mediaType) ? media.mediaType : null
      }
    : { photoKey: null, mediaType: null };

  try {
    let topLevelCommentId = null;
    let parentAuthorId = null;
    let replyTargetId = null;
    let inserted = false;

    const promotion = await Promotion.findById(promotionId);
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });

    const business = await Business.findOne({ placeId: promotion.placeId });
    if (!business) return res.status(404).json({ message: "Business not found" });

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

    const addNestedReply = (repliesArray, targetId, topLevelId) => {
      for (const reply of repliesArray) {
        if (reply._id.toString() === targetId) {
          parentAuthorId = reply.userId;
          replyTargetId = reply._id;
          topLevelCommentId = topLevelId;
          reply.replies.push(newReply);
          return true;
        }
        if (reply.replies?.length) {
          const found = addNestedReply(reply.replies, targetId, topLevelId);
          if (found) return true;
        }
      }
      return false;
    };

    const parentComment = promotion.comments.id(commentId);
    if (parentComment) {
      parentAuthorId = parentComment.userId;
      replyTargetId = parentComment._id;
      topLevelCommentId = parentComment._id;
      parentComment.replies.push(newReply);
      inserted = true;
    } else {
      for (const comment of promotion.comments || []) {
        if (comment.replies?.length) {
          const found = addNestedReply(comment.replies, commentId, comment._id);
          if (found) {
            inserted = true;
            break;
          }
        }
      }
    }

    if (!inserted) {
      return res.status(404).json({ message: "Parent comment or reply not found" });
    }

    await promotion.save();

    if (parentAuthorId?.toString() !== userId) {
      const targetUser = await User.findById(parentAuthorId);
      if (targetUser) {
        targetUser.notifications.push({
          type: 'reply',
          message: `${fullName} replied to your comment`,
          relatedId: userId,
          typeRef: 'User',
          targetId: promotionId,
          targetRef: null,
          commentId: topLevelCommentId,
          replyId: newReply._id,
          read: false,
          postType: 'promotion',
          createdAt: new Date()
        });
        await targetUser.save();
      }
    }

    if (
      parentAuthorId?.toString() === business._id?.toString() &&
      userId !== business.placeId?.toString()
    ) {
      business.notifications.push({
        type: 'reply',
        message: `${fullName} replied to your comment on your promotion`,
        relatedId: userId,
        typeRef: 'User',
        targetId: promotionId,
        targetRef: null,
        commentId: topLevelCommentId,
        replyId: newReply._id,
        read: false,
        postType: 'promotion',
        createdAt: new Date()
      });
      await business.save();
    }

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
    console.error("Error adding reply to promotion comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 POST: Toggle like on a comment or reply
router.put("/:promotionId/comments/:commentId/like", async (req, res) => {
  const { promotionId, commentId } = req.params;
  const { userId, fullName } = req.body;

  if (!userId || !fullName) {
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    let target = null;
    let parentAuthorId = null;
    let topLevelCommentId = null;

    // Recursive function to find comment/reply and track the hierarchy
    const findReplyRecursive = (replies, parentTopLevelId = null) => {
      for (const reply of replies) {
        if (reply._id.toString() === commentId) {
          parentAuthorId = reply.userId;
          topLevelCommentId = parentTopLevelId;
          return reply;
        }
        if (reply.replies?.length) {
          const found = findReplyRecursive(reply.replies, parentTopLevelId);
          if (found) return found;
        }
      }
      return null;
    };

    // Check top-level comments
    const comment = promotion.comments.id(commentId);
    if (comment) {
      target = comment;
      parentAuthorId = comment.userId;
      topLevelCommentId = comment._id;
    } else {
      for (const c of promotion.comments || []) {
        const found = findReplyRecursive(c.replies, c._id);
        if (found) {
          target = found;
          break;
        }
      }
    }

    if (!target) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    target.likes = target.likes || [];
    const existingIndex = target.likes.findIndex(l => l.userId.toString() === userId);
    const isUnliking = existingIndex > -1;

    if (isUnliking) {
      target.likes.splice(existingIndex, 1); // 💔 Remove like
    } else {
      target.likes.push({ userId, fullName, date: new Date() }); // ❤️ Add like
    }

    await promotion.save();

    // 🔔 Notification logic
    if (parentAuthorId?.toString() !== userId) {
      const targetUser = await User.findById(parentAuthorId);
      if (targetUser) {
        const commentIdToSave = topLevelCommentId || commentId;

        const existingNotifIndex = targetUser.notifications.findIndex(n =>
          n.type === 'like' &&
          n.relatedId?.toString() === userId &&
          n.typeRef === 'User' &&
          n.targetId?.toString() === promotionId &&
          n.commentId?.toString() === commentIdToSave?.toString() &&
          n.replyId?.toString() === commentId &&
          n.postType === 'promotion'
        );

        if (!isUnliking && existingNotifIndex === -1) {
          // ➕ Add like notification
          targetUser.notifications.push({
            type: 'like',
            message: `${fullName} liked your comment`,
            relatedId: userId,
            typeRef: 'User',
            targetId: promotionId,
            targetRef: null,
            commentId: commentIdToSave,
            replyId: commentId,
            read: false,
            postType: 'promotion',
            createdAt: new Date()
          });
          await targetUser.save();
        }

        if (isUnliking && existingNotifIndex !== -1) {
          // 🗑 Remove like notification
          targetUser.notifications.splice(existingNotifIndex, 1);
          await targetUser.save();
        }
      }
    }

    res.status(200).json({
      message: "Like toggled successfully",
      likes: target.likes,
    });
  } catch (error) {
    console.error("Error toggling like on comment/reply:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 PATCH: Edit a comment or reply
router.patch("/:promotionId/edit-comment/:commentId", async (req, res) => {
  const { promotionId, commentId } = req.params;
  const { newText, media } = req.body;

  console.log("🛠️ PATCH /edit-comment");
  console.log("📨 Incoming:", { promotionId, commentId, newText, media });

  const mediaPayload = media?.photoKey && media?.mediaType
    ? {
        photoKey: media.photoKey,
        mediaType: ['image', 'video'].includes(media.mediaType) ? media.mediaType : null,
      }
    : { photoKey: null, mediaType: null };

  console.log("📦 Parsed mediaPayload:", mediaPayload);

  let oldPhotoKeyToDelete = null;
  let updatedComment = null;

  const updateCommentRecursively = (comments) => {
    for (const c of comments) {
      if (c._id.toString() === commentId) {
        const originalKey = c.media?.photoKey || null;
        const newKey = mediaPayload.photoKey;

        if (originalKey && originalKey !== newKey) {
          oldPhotoKeyToDelete = originalKey;
          console.log(`🗑️ Old media key marked for deletion: ${oldPhotoKeyToDelete}`);
        }

        c.commentText = newText;
        c.media = mediaPayload;
        updatedComment = {
          _id: c._id,
          userId: c.userId,
          fullName: c.fullName,
          commentText: newText,
          createdAt: c.createdAt,
          updatedAt: new Date(),
          likes: c.likes || [],
          replies: c.replies || [],
          media: c.media
        };

        console.log("✅ Comment updated in memory:", updatedComment);
        return true;
      }

      if (c.replies?.length && updateCommentRecursively(c.replies)) return true;
    }
    return false;
  };

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      console.warn("❌ Promotion not found:", promotionId);
      return res.status(404).json({ message: "Promotion not found" });
    }

    const found = updateCommentRecursively(promotion.comments || []);
    if (!found) {
      console.warn("❌ Comment not found in promotion:", commentId);
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    promotion.updatedAt = new Date();
    await promotion.save();
    console.log("💾 Promotion updated and saved");

    if (oldPhotoKeyToDelete) {
      console.log("🧹 Deleting old S3 object:", oldPhotoKeyToDelete);
      await deleteS3Objects([oldPhotoKeyToDelete]);
    }

    const presignedUrl = mediaPayload.photoKey
      ? await getPresignedUrl(mediaPayload.photoKey)
      : null;

    const finalPayload = {
      message: "Comment updated successfully",
      updatedComment: {
        ...updatedComment,
        media: mediaPayload.photoKey ? {
          ...mediaPayload,
          mediaUrl: presignedUrl
        } : null
      }
    };

    console.log("📤 Responding with payload:", finalPayload);
    res.json(finalPayload);
  } catch (error) {
    console.error("💥 Error editing comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 🧹 DELETE: Remove a comment or reply from a promotion
router.delete("/:promotionId/delete-comment/:commentId", async (req, res) => {
  const { promotionId, commentId } = req.params;

  let mediaKeyToDelete = null;

  const deleteNestedComment = (comments = [], targetId) => {
    return comments
      .map(comment => {
        if (comment._id.toString() === targetId) {
          if (comment.media?.photoKey) {
            mediaKeyToDelete = comment.media.photoKey;
          }
          return null; // remove this comment
        }

        if (comment.replies?.length) {
          comment.replies = deleteNestedComment(comment.replies, targetId);
        }

        return comment;
      })
      .filter(Boolean);
  };

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    const originalLength = JSON.stringify(promotion.comments || []).length;

    promotion.comments = deleteNestedComment(promotion.comments || [], commentId);

    const newLength = JSON.stringify(promotion.comments).length;
    if (originalLength === newLength) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    promotion.updatedAt = new Date();
    await promotion.save();

    if (mediaKeyToDelete) {
      await deleteS3Objects([mediaKeyToDelete]);
    }

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting promotion comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
