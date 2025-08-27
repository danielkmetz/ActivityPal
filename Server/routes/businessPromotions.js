const express = require("express");
const router = express.Router();
const Business = require("../models/Business");
const Promotion = require('../models/Promotions.js')
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const { extractTimeOnly } = require('../utils/extractTimeOnly.js');
const { enrichComments } = require('../utils/userPosts.js');
const { isPromoActive, isPromoLaterToday } = require('../utils/enrichBusinesses.js');

//retrieve a single promo by ID
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

module.exports = router;
