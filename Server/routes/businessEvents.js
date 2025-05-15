const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

// Route to get events for a business by placeId
router.get("/events/:placeId", async (req, res) => {
  const { placeId } = req.params;

  try {
    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const enhancedEvents = await Promise.all(
      (business.events || []).map(async (event) => {
        // If event has photos, map each to include a signed URL
        if (Array.isArray(event.photos) && event.photos.length > 0) {
          const photosWithUrls = await Promise.all(
            event.photos.map(async (photo) => {
              const url = await getPresignedUrl(photo.photoKey);
              return {
                ...photo,
                url,
              };
            })
          );
          return {
            ...event.toObject?.() ?? event, // Convert Mongoose doc to plain object
            photos: photosWithUrls,
          };
        } else {
          return event.toObject?.() ?? event;
        }
      })
    );

    res.status(200).json({ events: enhancedEvents });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Route to create a new event for a business
router.post('/events/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const { title, description, date, photos, recurring, recurringDays, startTime, endTime, allDay } = req.body;
  
  try {
    // Validate request body
    if (!title || !description) {
      return res.status(400).json({ message: 'All fields are required: title, date, and description.' });
    }

    // Find the business by placeId
    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    // Convert `photos` array into `PhotoSchema` format and generate presigned URLs
    const photoObjects = await Promise.all(
      (photos || []).map(async (photo) => {
        const downloadUrl = await getPresignedUrl(photo.photoKey);

        return {
          photoKey: photo.photoKey,
          uploadedBy: placeId,
          description: photo.description || null,
          uploadDate: new Date(),
          url: downloadUrl,
        };
      })
    );

    // Add the new event to the business's events array
    const newEvent = {
      title,
      description,
      date,
      photos: photoObjects, // ✅ Correct field name
      recurring,
      recurringDays,
      startTime,
      endTime,
      allDay,
    };

    business.events.push(newEvent);
    const savedBusiness = await business.save();

    const createdEvent = savedBusiness.events[savedBusiness.events.length - 1];

    const eventResponse = {
      _id: createdEvent._id,
      title,
      description,
      date,
      photos: photoObjects,
      recurring,
      recurringDays: recurring ? recurringDays : [],
      createdAt: new Date(),
      updatedAt: new Date(),
      startTime,
      endTime,
      allDay,
    };

    res.status(201).json({ message: 'Event created successfully', event: eventResponse });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update an event by its _id and placeId
router.put('/events/:placeId/:eventId', async (req, res) => {
  const { placeId, eventId } = req.params;
  const { title, date, description, photos, recurring, recurringDays, startTime, endTime, allDay } = req.body;
  console.log('📥 Incoming photos array:', photos);

  try {
    // Find the business by placeId and eventId
    const business = await Business.findOne({ placeId, 'events._id': eventId });

    if (!business) {
      return res.status(404).json({ message: 'Business or event not found' });
    }

    // Find the specific event in the events array
    const event = business.events.id(eventId);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Update the event fields if provided
    if (title) event.title = title;
    if (date) event.date = date;
    if (description) event.description = description;
    if (recurring) event.recurring = recurring;
    if (recurringDays) event.recurringDays = recurringDays;
    if (startTime) event.startTime = startTime;
    if (endTime) event.endTime = endTime;
    if (allDay !== undefined) event.allDay = allDay;
    event.photos = photos;
    
    event.updatedAt = new Date();

    // Save the updated business document
    const editedEvent = await business.save();

    res.status(200).json({ message: 'Event updated successfully', event: editedEvent });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Endpoint to delete an event by placeId and eventId
router.delete('/events/:placeId/:eventId', async (req, res) => {
  const { placeId, eventId } = req.params;

  try {
    // Find the business by placeId
    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    // Filter out the event to be deleted
    const updatedEvents = business.events.filter(
      (event) => event._id.toString() !== eventId
    );

    // If the event was not found in the list
    if (updatedEvents.length === business.events.length) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Update the events list
    business.events = updatedEvents;
    await business.save();

    res.status(200).json({ message: 'Event deleted successfully', events: business.events });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

