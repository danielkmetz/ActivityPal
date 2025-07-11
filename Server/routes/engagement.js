const express = require('express');
const router = express.Router();
const Engagement = require('../models/Engagement'); // Adjust path if needed
const verifyToken = require('../middleware/verifyToken');

// POST /api/engagement — log engagement once per UTC day per user
router.post('/', verifyToken, async (req, res) => {
  try {
    const { targetType, targetId, engagementType, placeId = null } = req.body;

    if (!targetType || !targetId || !engagementType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const userId = req.user.id;

    // Calculate UTC midnight start time for today
    const now = new Date();
    const startOfUtcDay = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(), // 00:00 UTC today
      0, 0, 0, 0
    ));

    // Check if engagement already exists today
    const existing = await Engagement.findOne({
      userId,
      targetType,
      targetId,
      engagementType,
      timestamp: { $gte: startOfUtcDay }
    });

    if (existing) {
      return res.status(200).json({ message: 'Engagement already logged today' });
    }

    // Create new engagement
    const newEngagement = await Engagement.create({
      userId,
      targetType,
      targetId,
      engagementType,
      placeId,
      timestamp: new Date() // now (UTC timestamp)
    });

    res.status(201).json({
      message: 'Engagement logged',
      engagement: newEngagement
    });
  } catch (error) {
    console.error('❌ Error logging engagement:', error);
    res.status(500).json({ message: 'Server error logging engagement' });
  }
});

// GET /api/engagement?targetType=promo&targetId=123 — fetch engagements
router.get('/', verifyToken, async (req, res) => {
  try {
    const { targetType, targetId } = req.query;

    if (!targetType || !targetId) {
      return res.status(400).json({ message: 'Missing query parameters' });
    }

    const engagements = await Engagement.find({
      targetType,
      targetId
    }).sort({ timestamp: -1 });

    res.json(engagements);
  } catch (error) {
    console.error('❌ Error fetching engagements:', error);
    res.status(500).json({ message: 'Server error fetching engagements' });
  }
});

module.exports = router;
