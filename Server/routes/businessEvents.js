const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const Event = require('../models/Events.js');
const HiddenPost = require('../models/HiddenPosts.js');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const deleteS3Objects = require('../utils/deleteS3Objects.js');
const { enrichComments } = require('../utils/userPosts.js');
const { isEventLaterToday, isEventActive } = require('../utils/enrichBusinesses.js');
const { filterHiddenEvents } = require('../utils/posts/filterHiddenPosts.js');
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

  // tiny helper to avoid blowing up on a bad/missing photoKey
  const safePresign = async (photoKey) => {
    if (!photoKey) return null;
    try {
      return await getPresignedUrl(photoKey);
    } catch (e) {
      console.warn("Failed to presign photoKey:", photoKey, e?.message || e);
      return null;
    }
  };

  try {
    // Only pull what we need from Business for speed
    const business = await Business.findOne(
      { placeId },
      { _id: 1, placeId: 1, businessName: 1, logoKey: 1 }
    ).lean();

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Compute the logo URL once (if there is a logoKey)
    const businessLogoUrl = business.logoKey
      ? await safePresign(business.logoKey)
      : null;

    // 🔹 Get all events for this placeId
    const allEvents = await Event.find({ placeId }).lean();

    // 🔹 Filter out hidden events for the current viewer (if authenticated)
    const viewerId = req.user?.id || null; // assumes upstream auth middleware

    const events = await filterHiddenEvents(allEvents, viewerId, {
      debugTag: '[/events/:placeId]',
      // log: true, // uncomment for debug logging
    });

    const enhancedEvents = await Promise.all(
      events.map(async (event) => {
        // Enrich photos and comments in parallel
        const [photos, comments] = await Promise.all([
          Promise.all(
            (event.photos || []).map(async (photo) => ({
              ...photo,
              url: await safePresign(photo.photoKey),
            }))
          ),
          enrichComments(event.comments || []),
        ]);

        return {
          ...event,
          _id: event._id?.toString?.() || event._id,
          photos,
          comments,
          businessName: business.businessName,
          ownerId: business._id.toString(),
          placeId: business.placeId,
          kind: "Event",
          businessLogoUrl, // convenient per-event
        };
      })
    );

    // Also return top-level businessLogoUrl if you want it handy at the page level
    res.status(200).json({ events: enhancedEvents, businessLogoUrl });
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
    const uploaderId = business._id;

    const enrichedPhotos = await Promise.all(
      photos.map(async (photo) => ({
        photoKey: photo.photoKey,
        taggedUsers: photo.taggedUsers ?? [],
        uploadedBy: uploaderId,
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
    const uploaderId = business._id;

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
          uploadedBy: uploaderId,
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

module.exports = router;

