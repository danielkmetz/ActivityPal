const express = require('express');
const router = express.Router();
const Business = require('../models/Business');

// Route to get events for a business by placeId
router.get('/events/:placeId', async (req, res) => {
    const { placeId } = req.params;
  
    try {
      // Find the business by placeId
      const business = await Business.findOne({ placeId });
      if (!business) {
        return res.status(404).json({ message: 'Business not found' });
      }
  
      // Return the events for the business
      res.status(200).json({ events: business.events || [] });
    } catch (error) {
      console.error('Error fetching events:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

// Route to create a new event for a business
router.post('/events/:placeId', async (req, res) => {
    const { placeId } = req.params;
    const { title, date, description } = req.body;

    try {
        // Validate request body
        if (!title || !date || !description) {
            return res.status(400).json({ message: 'All fields are required: title, date, and description.' });
        }

        // Find the business by placeId
        const business = await Business.findOne({ placeId });
        if (!business) {
            return res.status(404).json({ message: 'Business not found' });
        }

        // Add the new event to the business's events array
        const newEvent = { title, date, description };
        business.events.push(newEvent);

        // Save the updated business document
        await business.save();

        res.status(201).json({ message: 'Event created successfully', event: newEvent });
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update an event by its _id and placeId
router.put('/events/:placeId/:eventId', async (req, res) => {
    const { placeId, eventId } = req.params;
    const { title, date, description } = req.body;

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

        // Save the updated business document
        await business.save();

        res.status(200).json({ message: 'Event updated successfully', event });
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

