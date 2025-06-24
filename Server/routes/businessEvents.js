const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const Event = require('../models/Events.js');
const mongoose = require('mongoose');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

// 🔁 Recursively find and update the comment/reply
function updateNestedComment(comments, commentId, newText) {
  for (let comment of comments) {
    if (comment._id.toString() === commentId) {
      comment.commentText = newText;
      comment.updatedAt = new Date();
      return comment; // return updated comment object
    }

    if (comment.replies) {
      const updated = updateNestedComment(comment.replies, commentId, newText);
      if (updated) return updated;
    }
  }
  return null;
}

// 🧹 Recursive function to remove a comment/reply
function deleteNestedComment(comments, targetId) {
  for (let i = 0; i < comments.length; i++) {
    if (comments[i]._id.toString() === targetId) {
      comments.splice(i, 1);
      return true;
    }
    if (comments[i].replies?.length) {
      const deleted = deleteNestedComment(comments[i].replies, targetId);
      if (deleted) return true;
    }
  }
  return false;
}

///
router.get("/events/:placeId", async (req, res) => {
  const { placeId } = req.params;

  try {
    const business = await Business.findOne({ placeId }).lean();
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const events = await Event.find({ placeId: business.placeId }).lean();

    const enhancedEvents = await Promise.all(
      events.map(async (event) => {
        const photosWithUrls = await Promise.all(
          (event.photos || []).map(async (photo) => {
            const url = await getPresignedUrl(photo.photoKey);
            return { ...photo, url };
          })
        );

        return {
          ...event,
          photos: photosWithUrls,
          businessName: business.businessName,
          placeId: business.placeId,
        };
      })
    );

    res.status(200).json({ events: enhancedEvents });
  } catch (error) {
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
    photos,
    recurring,
    recurringDays,
    startTime,
    endTime,
    allDay
  } = req.body;

  try {
    if (!title || !description) {
      return res.status(400).json({ message: "Missing required fields: title, description" });
    }

    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const photoObjects = await Promise.all(
      (photos || []).map(async (photo) => {
        const url = await getPresignedUrl(photo.photoKey);
        return {
          photoKey: photo.photoKey,
          taggedUsers: photo.taggedUsers || [],
          uploadedBy: placeId,
          url,
        };
      })
    );

    const newEvent = new Event({
      title,
      description,
      date,
      photos: photoObjects,
      recurring: !!recurring,
      recurringDays: recurring ? recurringDays : [],
      startTime,
      endTime,
      allDay,
      placeId,
    });

    const savedEvent = await newEvent.save();

    res.status(201).json({ message: "Event created successfully", event: savedEvent });
  } catch (error) {
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
    photos,
    recurring,
    recurringDays,
    startTime,
    endTime,
    allDay,
  } = req.body;

  try {
    const business = await Business.findOne({ placeId }).lean();
    if (!business) return res.status(404).json({ message: "Business not found" });

    const event = await Event.findOne({ _id: eventId, placeId: business.placeId });
    if (!event) return res.status(404).json({ message: "Event not found" });

    // ✅ Update fields if provided
    if (title !== undefined) event.title = title;
    if (date !== undefined) event.date = date;
    if (description !== undefined) event.description = description;
    if (recurring !== undefined) event.recurring = recurring;
    if (recurringDays !== undefined) event.recurringDays = recurringDays;
    if (startTime !== undefined) event.startTime = startTime;
    if (endTime !== undefined) event.endTime = endTime;
    if (allDay !== undefined) event.allDay = allDay;

    // ✅ Handle photos with presigned URLs
    if (photos !== undefined) {
      event.photos = await Promise.all(
        photos.map(async (photo) => ({
          ...photo,
          url: await getPresignedUrl(photo.photoKey),
        }))
      );
    }

    event.updatedAt = new Date();
    const updatedEvent = await event.save();

    res.status(200).json({ message: "Event updated successfully", event: updatedEvent });
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

// Toggle like on an event
router.post("/events/:placeId/:eventId/like", async (req, res) => {
  const { placeId, eventId } = req.params;
  const { userId, fullName } = req.body;

  if (!userId || !fullName) {
    return res.status(400).json({ message: "Missing userId or fullName" });
  }

  try {
    const business = await Business.findOne({ placeId }).lean();
    if (!business) return res.status(404).json({ message: "Business not found" });

    const event = await Event.findOne({ _id: eventId, placeId: business.placeId });
    if (!event) return res.status(404).json({ message: "Event not found" });

    const existingIndex = event.likes.findIndex((like) => like.userId.toString() === userId);

    if (existingIndex > -1) {
      // 💔 Remove existing like
      event.likes.splice(existingIndex, 1);
    } else {
      // ❤️ Add new like
      event.likes.push({ userId, fullName, date: new Date() });
    }

    await event.save();

    res.status(200).json({
      message: "Like toggled successfully",
      likes: event.likes,
    });
  } catch (error) {
    console.error("Error toggling event like:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// 📌 POST: Add a comment to an event
router.post("/events/:placeId/:eventId/comments", async (req, res) => {
  const { placeId, eventId } = req.params;
  const { userId, fullName, commentText } = req.body;

  if (!userId || !fullName || !commentText) {
    return res.status(400).json({ message: "Missing required fields: userId, fullName, commentText" });
  }

  try {
    const business = await Business.findOne({ placeId }).lean();
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
    };

    event.comments.push(newComment);
    await event.save();

    const addedComment = event.comments[event.comments.length - 1];

    res.status(201).json({
      message: "Comment added successfully",
      comment: addedComment,
    });
  } catch (error) {
    console.error("Error adding comment to event:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/events/:eventId/comments/:commentId/replies", async (req, res) => {
  const { placeId, eventId, commentId } = req.params;
  const { userId, fullName, commentText } = req.body;

  if (!userId || !fullName || !commentText) {
    return res.status(400).json({ message: "Missing required fields: userId, fullName, commentText" });
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const newReply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      fullName,
      commentText,
      date: new Date(),
      likes: [],
      replies: [],
    };

    let inserted = false;

    // Helper to insert reply recursively
    const addNestedReply = (repliesArray, targetId) => {
      for (const reply of repliesArray) {
        if (reply._id.toString() === targetId) {
          reply.replies.push(newReply);
          return true;
        }
        if (reply.replies?.length) {
          const found = addNestedReply(reply.replies, targetId);
          if (found) return true;
        }
      }
      return false;
    };

    // Try top-level comment
    const parentComment = event.comments.id(commentId);
    if (parentComment) {
      parentComment.replies.push(newReply);
      inserted = true;
    } else {
      // Try nested replies
      for (const comment of event.comments) {
        if (comment.replies?.length) {
          inserted = addNestedReply(comment.replies, commentId);
          if (inserted) break;
        }
      }
    }

    if (!inserted) {
      return res.status(404).json({ message: "Parent comment or reply not found" });
    }

    await event.save();

    res.status(201).json({
      message: "Reply added successfully",
      reply: newReply,
    });
  } catch (error) {
    console.error("Error adding reply to event comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 POST: Toggle like on a comment or reply in an event
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

    const findReplyRecursive = (replies) => {
      for (const reply of replies) {
        if (reply._id.toString() === commentId) return reply;
        if (reply.replies?.length) {
          const found = findReplyRecursive(reply.replies);
          if (found) return found;
        }
      }
      return null;
    };

    // Try top-level comment
    const comment = event.comments.id(commentId);
    if (comment) {
      target = comment;
    } else {
      for (const c of event.comments) {
        target = findReplyRecursive(c.replies);
        if (target) break;
      }
    }

    if (!target) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    if (!target.likes) target.likes = [];

    const existingIndex = target.likes.findIndex((like) => like.userId.toString() === userId);

    if (existingIndex > -1) {
      target.likes.splice(existingIndex, 1); // 💔 Remove
    } else {
      target.likes.push({ userId, fullName, date: new Date() }); // ❤️ Add
    }

    await event.save();

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
router.put("/events/:placeId/:eventId/edit-comment/:commentId", async (req, res) => {
  const { placeId, eventId, commentId } = req.params;
  const { commentText } = req.body;

  if (!commentText || commentText.trim() === "") {
    return res.status(400).json({ message: "Comment text is required." });
  }

  try {
    const business = await Business.findOne({ placeId }).lean();
    if (!business) return res.status(404).json({ message: "Business not found" });

    const event = await Event.findOne({ _id: eventId, placeId: business.placeId });
    if (!event) return res.status(404).json({ message: "Event not found" });

    const updatedComment = updateNestedComment(event.comments || [], commentId, commentText);
    if (!updatedComment) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    event.updatedAt = new Date();
    await event.save();

    res.json({ message: "Comment updated successfully", updatedComment });
  } catch (error) {
    console.error("Error editing event comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 🗑️ DELETE: Remove a comment or reply from an event
router.delete("/events/:eventId/delete-comment/:commentId", async (req, res) => {
  const { placeId, eventId, commentId } = req.params;

  try {
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const deleted = deleteNestedComment(event.comments || [], commentId);
    if (!deleted) {
      return res.status(404).json({ message: "Comment or reply not found" });
    }

    event.updatedAt = new Date();
    await event.save();

    res.json({ message: "Comment or reply deleted successfully" });
  } catch (error) {
    console.error("Error deleting event comment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;

