const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const User = require('../models/User.js');
const Event = require('../models/Events.js');
const mongoose = require('mongoose');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const deleteS3Objects = require('../utils/deleteS3Objects.js');
const { enrichComments } = require('../utils/userPosts.js');
const { isEventLaterToday, isEventActive } = require('../utils/enrichBusinesses.js');
const { DateTime } = require("luxon");

router.get("/event/:eventId", async (req, res) => {
  const { eventId } = req.params;

  try {
    const event = await Event.findById(eventId).lean();
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Get time context
    const now = new Date();
    const nowLocal = DateTime.fromJSDate(now).toLocal();
    const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;

    // Determine kind
    let kind = "inactiveEvent";
    if (isEventActive(event, nowMinutes, now)) {
      kind = "activeEvent";
    } else if (isEventLaterToday(event, nowMinutes, now)) {
      kind = "upcomingEvent";
    }

    // Enrich comments
    const enrichedComments = await enrichComments(event.comments || []);

    // Enrich photos
    const enrichedPhotos = await Promise.all(
      (event.photos || []).map(async (photo) => {
        const url = await getPresignedUrl(photo.photoKey);
        return { ...photo, url };
      })
    );

    // Get business name
    let businessName = null;
    if (event.placeId) {
      const business = await Business.findOne({ placeId: event.placeId }).lean();
      businessName = business?.businessName || null;
    }

    // Build final enriched object
    const enrichedEvent = {
      ...event,
      kind,
      comments: enrichedComments,
      photos: enrichedPhotos,
      businessName,
    };

    res.json({ event: enrichedEvent });
  } catch (error) {
    console.error("Error fetching event:", error);
    res.status(500).json({ message: "Server error fetching event" });
  }
});

///
router.get("/events/:placeId", async (req, res) => {
  const { placeId } = req.params;

  try {
    // Lean query for better performance
    const business = await Business.findOne({ placeId }).lean();
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Lean event fetch for lightweight objects
    const events = await Event.find({ placeId }).lean();

    const enhancedEvents = await Promise.all(
      events.map(async (event) => {
        const photos = await Promise.all(
          (event.photos || []).map(async (photo) => ({
            ...photo,
            url: await getPresignedUrl(photo.photoKey),
          }))
        );

        return {
          ...event,
          photos,
          businessName: business.businessName,
          ownerId: business._id.toString(),
          placeId: business.placeId,
          kind: 'Event',
        };
      })
    );

    res.status(200).json({ events: enhancedEvents });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: "Server error" });
  }
});

///
router.post("/events/:placeId", async (req, res) => {
  const { placeId } = req.params;
  const {
    title,
    description,
    date,
    photos = [],
    recurring = false,
    recurringDays = [],
    startTime,
    endTime,
    allDay = false,
  } = req.body;

  try {
    if (!title || !description) {
      return res.status(400).json({ message: "Missing required fields: title, description" });
    }

    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const enrichedPhotos = await Promise.all(
      photos.map(async (photo) => ({
        photoKey: photo.photoKey,
        taggedUsers: photo.taggedUsers ?? [],
        uploadedBy: placeId,
        url: await getPresignedUrl(photo.photoKey),
      }))
    );

    const newEvent = new Event({
      title,
      description,
      date,
      photos: enrichedPhotos,
      recurring,
      recurringDays: recurring ? recurringDays : [],
      startTime,
      endTime,
      allDay,
      placeId,
    });

    const savedEvent = await newEvent.save();

    res.status(201).json({
      message: "Event created successfully",
      event: {
        ...savedEvent.toObject(),
        kind: "Event",
        ownerId: business._id,
      },
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update an event by its _id and placeId
router.put("/events/:placeId/:eventId", async (req, res) => {
  const { placeId, eventId } = req.params;
  const {
    title,
    date,
    description,
    photos = [],
    recurring,
    recurringDays,
    startTime,
    endTime,
    allDay,
  } = req.body;

  try {
    const business = await Business.findOne({ placeId });
    if (!business) return res.status(404).json({ message: "Business not found" });

    const event = await Event.findOne({ _id: eventId, placeId });
    if (!event) return res.status(404).json({ message: "Event not found" });

    // 🔁 Dynamically update only provided fields
    const fieldsToUpdate = {
      title,
      date,
      description,
      recurring,
      recurringDays,
      startTime,
      endTime,
      allDay,
    };

    Object.entries(fieldsToUpdate).forEach(([key, value]) => {
      if (value !== undefined) event[key] = value;
    });

    // 🖼 Update photos with presigned URLs if provided
    if (photos.length > 0) {
      event.photos = await Promise.all(
        photos.map(async (photo) => ({
          ...photo,
          url: await getPresignedUrl(photo.photoKey),
        }))
      );
    }

    event.updatedAt = new Date();
    const updatedEvent = await event.save();

    res.status(200).json({
      message: "Event updated successfully",
      event: {
        ...updatedEvent.toObject(),
        kind: "Event",
        ownerId: business._id,
      },
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Endpoint to delete an event by placeId and eventId
router.delete("/events/:placeId/:eventId", async (req, res) => {
  const { placeId, eventId } = req.params;

  try {
    const business = await Business.findOne({ placeId }).lean();
    if (!business) return res.status(404).json({ message: "Business not found" });

    const deleted = await Event.findOneAndDelete({
      _id: eventId,
      placeId: business.placeId,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Event not found or already deleted" });
    }

    res.status(200).json({ message: "Event deleted successfully", eventId });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Server error" });
  }
});

//toggle a like on a event
router.post("/events/:placeId/:eventId/like", async (req, res) => {
  const { placeId, eventId } = req.params;
  const { userId, fullName } = req.body;

  if (!userId || !fullName) {
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const [business, event] = await Promise.all([
      Business.findOne({ placeId }),
      Event.findById(eventId)
    ]);

    if (!business || !event) {
      return res.status(404).json({ message: "Business or event not found" });
    }

    const likeIndex = event.likes.findIndex((like) => like.userId.toString() === userId);
    const isUnliking = likeIndex > -1;

    const notificationMatch = (n) =>
      n.type === 'like' &&
      n.relatedId?.toString() === userId &&
      n.targetId?.toString() === eventId &&
      n.postType === 'event';

    let eventModified = false;
    let businessModified = false;

    if (isUnliking) {
      event.likes.splice(likeIndex, 1);
      eventModified = true;

      const notifIndex = business.notifications.findIndex(notificationMatch);
      if (notifIndex !== -1) {
        business.notifications.splice(notifIndex, 1);
        businessModified = true;
        console.log(`🗑️ Removed like notification for user ${userId} on event ${eventId}`);
      }
    } else {
      event.likes.push({ userId, fullName, date: new Date() });
      eventModified = true;

      // ✅ Notification creation intentionally removed
    }

    await Promise.all([
      eventModified ? event.save() : null,
      businessModified ? business.save() : null
    ]);

    res.status(200).json({
      message: "Like toggled successfully",
      likes: event.likes
    });
  } catch (error) {
    console.error("Error toggling event like:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// 📌 POST: Add a comment to an event
router.post("/events/:placeId/:eventId/comments", async (req, res) => {
  const { placeId, eventId } = req.params;
  const { userId, fullName, commentText, media } = req.body;

  const mediaPayload = media?.photoKey && media?.mediaType
    ? {
        photoKey: media.photoKey,
        mediaType: ['image', 'video'].includes(media.mediaType) ? media.mediaType : null
      }
    : { photoKey: null, mediaType: null };

  try {
    const business = await Business.findOne({ placeId });
    if (!business) return res.status(404).json({ message: "Business not found" });

    const event = await Event.findOne({ _id: eventId, placeId: business.placeId });
    if (!event) return res.status(404).json({ message: "Event not found" });

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      likes: [],
      replies: [],
      media: mediaPayload
    };

    event.comments.push(newComment);
    await event.save();

    const addedComment = event.comments[event.comments.length - 1];
    const presignedUrl = addedComment.media?.photoKey ? await getPresignedUrl(addedComment.media.photoKey) : null;

    const isBusinessCommenting = userId === business._id.toString();
    if (!isBusinessCommenting) {
      const alreadyNotified = business.notifications.some(
        (n) =>
          n.type === 'comment' &&
          n.relatedId?.toString() === userId &&
          n.typeRef === 'User' &&
          n.targetId?.toString() === eventId &&
          n.commentId === newComment._id &&
          n.postType === 'event'
      );

      if (!alreadyNotified) {
        business.notifications.push({
          type: 'comment',
          message: `${fullName} commented on your event`,
          relatedId: userId,
          typeRef: 'User',
          targetId: eventId,
          targetRef: null,
          commentId: newComment._id,
          read: false,
          postType: 'event',
          createdAt: new Date()
        });
        await business.save();
      }
    }

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
    console.error("Error adding comment to event:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//Add a reply
router.post("/events/:eventId/comments/:commentId/replies", async (req, res) => {
  const { eventId, commentId } = req.params;
  const { userId, fullName, commentText, placeId, media } = req.body;

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

    const [event, business] = await Promise.all([
      Event.findById(eventId),
      Business.findOne({ placeId })
    ]);

    if (!event || !business) {
      return res.status(404).json({ message: "Event or business not found" });
    }

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

    const parentComment = event.comments.id(commentId);
    if (parentComment) {
      parentAuthorId = parentComment.userId;
      replyTargetId = parentComment._id;
      topLevelCommentId = parentComment._id;
      parentComment.replies.push(newReply);
      inserted = true;
    } else {
      for (const comment of event.comments) {
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

    await event.save();

    if (parentAuthorId?.toString() !== userId) {
      const targetUser = await User.findById(parentAuthorId);
      if (targetUser) {
        targetUser.notifications.push({
          type: 'reply',
          message: `${fullName} replied to your comment`,
          relatedId: userId,
          typeRef: 'User',
          targetId: eventId,
          targetRef: null,
          commentId: topLevelCommentId,
          replyId: newReply._id,
          read: false,
          postType: 'event',
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
        message: `${fullName} replied to your comment on ${business.businessName}'s event`,
        relatedId: userId,
        typeRef: 'User',
        targetId: eventId,
        targetRef: null,
        commentId: topLevelCommentId,
        replyId: newReply._id,
        read: false,
        postType: 'event',
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
    console.error("Error adding reply to event comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

//Like a comment or reply
router.post("/events/:eventId/comments/:commentId/like", async (req, res) => {
  const { placeId, eventId, commentId } = req.params;
  const { userId, fullName } = req.body;

  if (!userId || !fullName) {
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    let target = null;
    let parentAuthorId = null;
    let topLevelCommentId = null;

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

    const comment = event.comments.id(commentId);
    if (comment) {
      target = comment;
      parentAuthorId = comment.userId;
      topLevelCommentId = comment._id;
    } else {
      for (const c of event.comments) {
        if (c.replies?.length) {
          const found = findReplyRecursive(c.replies, c._id);
          if (found) {
            target = found;
            break;
          }
        }
      }
    }

    if (!target) return res.status(404).json({ message: "Comment or reply not found" });

    if (!target.likes) target.likes = [];

    const existingIndex = target.likes.findIndex((like) => like.userId.toString() === userId);
    const isUnliking = existingIndex > -1;

    if (isUnliking) {
      target.likes.splice(existingIndex, 1); // 💔 Remove like
    } else {
      target.likes.push({ userId, fullName, date: new Date() }); // ❤️ Add like
    }

    await event.save();

    // If liking someone else's comment or reply → notify them
    if (!isUnliking && parentAuthorId?.toString() !== userId) {
      const targetUser = await User.findById(parentAuthorId);
      if (targetUser) {
        const alreadyNotified = targetUser.notifications.some(n =>
          n.type === 'like' &&
          n.relatedId?.toString() === userId &&
          n.targetId?.toString() === eventId &&
          n.commentId?.toString() === (topLevelCommentId || commentId) &&
          n.replyId?.toString() === commentId
        );

        if (!alreadyNotified) {
          targetUser.notifications.push({
            type: 'like',
            message: `${fullName} liked your comment`,
            relatedId: userId,
            typeRef: 'User',
            targetId: eventId,
            targetRef: null,
            commentId: topLevelCommentId || commentId,
            replyId: commentId,
            read: false,
            postType: 'event',
            createdAt: new Date()
          });
          await targetUser.save();
        }
      }
    }

    if (isUnliking && parentAuthorId?.toString() !== userId) {
      const targetUser = await User.findById(parentAuthorId);
      if (targetUser) {
        const notifications = targetUser.notifications || [];

        const indexToRemove = notifications.findIndex(n => {
          const isMatch =
            n.type === 'like' &&
            n.relatedId?.toString() === userId &&
            n.targetId?.toString() === eventId &&
            n.commentId?.toString() === commentId;
          return isMatch;
        });

        if (indexToRemove > -1) {
          targetUser.notifications.splice(indexToRemove, 1);
          await targetUser.save();
        } else {
          console.log("⚠️ No matching notification found to remove");
        }
      } else {
        console.warn(`⚠️ Target user ${parentAuthorId} not found during unlike cleanup`);
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

// ✏️ PUT: Edit a comment or reply in an event
router.put("/events/:eventId/edit-comment/:commentId", async (req, res) => {
  const { eventId, commentId } = req.params;
  const { commentText, media } = req.body;
  console.log(commentText);

  const mediaPayload = media?.photoKey && media?.mediaType
    ? {
        photoKey: media.photoKey,
        mediaType: ['image', 'video'].includes(media.mediaType) ? media.mediaType : null
      }
    : { photoKey: null, mediaType: null };

  let oldPhotoKeyToDelete = null;
  let updatedCommentRef = null;

  const updateNestedComment = (comments) => {
    for (let comment of comments) {
      if (comment._id.toString() === commentId) {
        comment.commentText = commentText;

        const existingKey = comment.media?.photoKey || null;
        const newKey = mediaPayload.photoKey;

        // Mark old media for deletion if changed
        if (existingKey && existingKey !== newKey) {
          oldPhotoKeyToDelete = existingKey;
        }

        comment.media = mediaPayload;
        updatedCommentRef = comment;
        return comment;
      }

      if (comment.replies?.length > 0) {
        const nested = updateNestedComment(comment.replies);
        if (nested) return nested;
      }
    }
    return null;
  };

  try {
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const updatedComment = updateNestedComment(event.comments || []);
    if (!updatedComment) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    event.updatedAt = new Date();
    await event.save();

    if (oldPhotoKeyToDelete) {
      await deleteS3Objects([oldPhotoKeyToDelete]);
    }

    let presignedUrl = null;
    if (mediaPayload.photoKey) {
      presignedUrl = await getPresignedUrl(mediaPayload.photoKey);
    }

    return res.json({
      message: "Comment updated successfully",
      updatedComment: {
        ...updatedCommentRef.toObject?.() || updatedCommentRef,
        media: mediaPayload.photoKey ? {
          ...mediaPayload,
          mediaUrl: presignedUrl
        } : null
      }
    });
  } catch (error) {
    console.error("Error editing event comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 🗑️ DELETE: Remove a comment or reply from an event
router.delete("/events/:eventId/delete-comment/:commentId", async (req, res) => {
  const { eventId, commentId } = req.params;

  let mediaKeyToDelete = null;

  const deleteNestedComment = (comments, targetId) => {
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];

      if (comment._id.toString() === targetId) {
        if (comment.media?.photoKey) {
          mediaKeyToDelete = comment.media.photoKey;
        }
        comments.splice(i, 1);
        return true;
      }

      if (comment.replies?.length > 0) {
        const foundInReplies = deleteNestedComment(comment.replies, targetId);
        if (foundInReplies) return true;
      }
    }
    return false;
  };

  try {
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const deleted = deleteNestedComment(event.comments || [], commentId);
    if (!deleted) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    event.updatedAt = new Date();
    await event.save();

    if (mediaKeyToDelete) {
      await deleteS3Objects([mediaKeyToDelete]);
    }

    res.json({ message: "Comment or reply deleted successfully" });
  } catch (error) {
    console.error("Error deleting event comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;

