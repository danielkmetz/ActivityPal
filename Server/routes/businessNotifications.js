const express = require('express');
const router = express.Router();
const Business = require('../models/Business');

// GET all notifications for a business
router.get('/:placeId/notifications', async (req, res) => {
    try {
        const placeId = req.params.placeId;
        const business = await Business.findOne({ placeId }).select('notifications');
        if (!business) return res.status(404).json({ error: 'Business not found' });

        res.json(business.notifications);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT: Mark a specific notification as read
router.put('/:placeId/notifications/:notificationId/read', async (req, res) => {
    try {
        const { placeId, notificationId } = req.params;

        const business = await Business.findOne({ placeId });
        if (!business) return res.status(404).json({ error: 'Business not found' });

        const notification = business.notifications.id(notificationId);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });

        notification.read = true;
        await business.save();

        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// POST: Add a new notification to a business
router.post('/:placeId/notifications', async (req, res) => {
    try {
      const { placeId } = req.params;
      const {
        type,
        message,
        relatedId,
        typeRef,
        targetId,
        targetRef,
        postType,
      } = req.body;
  
      const business = await Business.findOne({ placeId });
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }
  
      const existingNotification = business.notifications.find(n =>
        n.type === type &&
        n.relatedId?.toString() === relatedId?.toString() &&
        (n.targetId?.toString() === targetId?.toString() || (!n.targetId && !targetId))
      );
  
      if (existingNotification) {
        return res.status(409).json({ error: 'Duplicate, notification already exists' });
      }
  
      const newNotification = {
        type,
        message,
        relatedId,
        typeRef,
        targetId,
        targetRef,
        read: false,
        postType,
        createdAt: new Date(),
      };
  
      business.notifications.push(newNotification);
      await business.save();
      
      res.status(201).json({ message: 'Notification added', notification: newNotification });
    } catch (error) {
      res.status(500).json({ error: 'Server error', details: error.message });
    }
});
  
// DELETE: Remove a specific notification from business
router.delete('/:placeId/notifications/:notificationId', async (req, res) => {
    try {
        const { placeId, notificationId } = req.params;

        const business = await Business.findOne({ placeId });
        if (!business) return res.status(404).json({ error: 'Business not found' });

        business.notifications = business.notifications.filter(n => n._id.toString() !== notificationId);
        await business.save();

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
