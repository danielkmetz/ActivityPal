const express = require("express");
const router = express.Router();
const Business = require("../models/Business");
const Promotion = require('../models/Promotions.js');
const HiddenPost = require('../models/HiddenPosts.js');
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

    const safePresign = async (photoKey) => {
      if (!photoKey) return null;
      try {
        return await getPresignedUrl(photoKey);
      } catch (e) {
        console.error(`❌ Failed to get presigned URL for photoKey: ${photoKey}`, e);
        return null;
      }
    };

    // Fetch business + (filtered) promotions in parallel
    const [business, hiddenPromotionObjIds] = await Promise.all([
      Business.findOne(
        { placeId },
        { _id: 1, businessName: 1, placeId: 1, logoKey: 1 }
      ).lean(),
      (async () => {
        const viewerId = req.user?.id;
        if (!viewerId || !mongoose.Types.ObjectId.isValid(viewerId)) return [];
        try {
          const rows = await HiddenPost.find(
            { userId: new mongoose.Types.ObjectId(viewerId), targetRef: 'Promotion' },
            { targetId: 1, _id: 0 }
          ).lean();
          return (rows || [])
            .map(r => r?.targetId)
            .filter(Boolean)
            .map(id => new mongoose.Types.ObjectId(String(id)));
        } catch (e) {
          console.warn('[GET /promotions/:placeId] hidden fetch failed:', e?.message);
          return [];
        }
      })(),
    ]);

    if (!business) {
      console.warn(`⚠️ Business not found for placeId: ${placeId}`);
      return res.status(404).json({ message: 'Business not found' });
    }

    // Compute logo URL once
    const businessLogoUrl = business.logoKey ? await safePresign(business.logoKey) : null;

    // Build Promotions query with DB-level exclusion
    const promoQuery = { placeId };
    if (hiddenPromotionObjIds.length) {
      promoQuery._id = { $nin: hiddenPromotionObjIds };
    }

    const promotions = await Promotion.find(promoQuery).lean();

    const enhanced = await Promise.all(
      promotions.map(async (promo) => {
        // Enrich photos + comments in parallel
        const [photos, comments] = await Promise.all([
          Promise.all(
            (promo.photos || []).map(async (photo, i) => {
              if (!photo?.photoKey) {
                console.warn(`⚠️ Promo ${promo._id} has invalid photo at index ${i}`);
                return { ...photo, url: null };
              }
              const url = await safePresign(photo.photoKey);
              return { ...photo, url };
            })
          ),
          enrichComments(promo.comments || []),
        ]);

        return {
          ...promo,
          _id: promo._id?.toString?.() || promo._id,
          photos,
          comments,                 // enriched comments (with nested replies/media)
          kind: 'promo',
          ownerId: business._id?.toString?.() || null,
          businessName: business.businessName || 'Unknown',
          businessLogoUrl,          // convenient per-item
        };
      })
    );

    // Top-level logo also included if the client wants it
    res.json({ promotions: enhanced, businessLogoUrl });
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

module.exports = router;
