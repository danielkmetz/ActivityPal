const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const Event = require('../models/Events');
const Promotion = require('../models/Promotions');
const verifyToken = require('../middleware/verifyToken');
const {
  isPromoLaterToday,
  isPromoActive,
  isEventLaterToday,
  isEventActive
} = require('../utils/enrichBusinesses');

router.post('/check-businesses', verifyToken, async (req, res) => {
  try {
    const { placeIds } = req.body;

    if (!placeIds || !Array.isArray(placeIds)) {
      return res.status(400).json({ message: 'Invalid or missing placeIds array' });
    }

    // Time setup
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Step 1: Find matching businesses
    const businesses = await Business.find({ placeId: { $in: placeIds } })
      .select('placeId businessName')
      .lean();

    // Step 2: Fetch events and promotions
    const [events, promotions] = await Promise.all([
      Event.find({ placeId: { $in: placeIds } }).lean(),
      Promotion.find({ placeId: { $in: placeIds } }).lean(),
    ]);

    // Step 3: Create map to group events/promos under business
    const businessMap = {};
    for (const pid of placeIds) {
      const key = String(pid);
      businessMap[key] = { placeId: key, businessName: null, events: [], promotions: [] };
    }

    // ✅ Overlay real business docs (if any) onto the placeholders
    for (const biz of businesses) {
      const key = String(biz.placeId);
      businessMap[key] = { ...businessMap[key], ...biz };
    }

    // Step 4: Assign kind and attach to businesses
    events.forEach(event => {
      let kind = 'event';
      if (isEventActive(event, nowMinutes, now)) {
        kind = 'activeEvent';
      } else if (isEventLaterToday(event, nowMinutes, now)) {
        kind = 'upcomingEvent';
      }
      const enrichedEvent = { ...event, kind };
      const eKey = String(event.placeId);
      if (businessMap[eKey]) businessMap[eKey].events.push(enrichedEvent);
    });

    promotions.forEach(promo => {
      let kind = 'promo';
      if (isPromoActive(promo, nowMinutes, now)) {
        kind = 'activePromo';
      } else if (isPromoLaterToday(promo, nowMinutes, now)) {
        kind = 'upcomingPromo';
      }
      const enrichedPromo = { ...promo, kind };
      const pKey = String(promo.placeId);
      if (businessMap[pKey]) businessMap[pKey].promotions.push(enrichedPromo);
    });

    const enrichedBusinesses = Object.values(businessMap);

    return res.status(200).json(enrichedBusinesses);
  } catch (error) {
    console.error('❌ Error in /check-businesses:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
