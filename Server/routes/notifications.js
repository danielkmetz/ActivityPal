const express = require('express');
const router = express.Router();
const User = require('../models/User');

// GET all notifications for a user
router.get('/:userId/notifications', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('notifications');
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(user.notifications);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT: Mark a specific notification as read
router.put('/:userId/notifications/:notificationId/read', async (req, res) => {
    try {
        const { userId, notificationId } = req.params;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const notification = user.notifications.id(notificationId);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });

        notification.read = true;
        await user.save();

        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/:userId/notifications', async (req, res) => {
    try {
        const { userId } = req.params;
        const { type, message, relatedId, typeRef, targetId, commentId, replyId } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 🔍 Check if a similar unread notification already exists
        const existingNotification = user.notifications.find(
            (n) => 
                n.type === type &&
                n.relatedId.toString() === relatedId.toString() &&
                n.targetId?.toString() === targetId?.toString() &&
                n.commentId?.toString() === commentId?.toString() &&
                n.replyId?.toString() === replyId?.toString() &&
                !n.read
        );

        if (existingNotification) {
            return res.status(409).json({ error: 'Duplicate, notification already exists' });
        }

        // ✅ Add the notification if it does not already exist
        const newNotification = {
            type,
            message,
            relatedId,   // User who triggered the notification (e.g., the liker, commenter)
            typeRef,
            targetId,    // The review ID
            commentId: commentId || null, // The comment ID (if applicable)
            replyId: replyId || null,  // The reply ID (if applicable)
            read: false,
            createdAt: new Date()
        };

        user.notifications.push(newNotification);
        await user.save();

        res.status(201).json({ message: 'Notification added', notification: newNotification });
    } catch (error) {
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

// DELETE: Remove a specific notification
router.delete('/:userId/notifications/:notificationId', async (req, res) => {
    try {
        const { userId, notificationId } = req.params;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.notifications = user.notifications.filter(n => n._id.toString() !== notificationId);
        await user.save();

        res.json({ message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});


module.exports = router;
