const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { DateTime } = require("luxon");
const Business = require("../models/Business");
const Promotion = require("../models/Promotions.js"); // ✅ singular to match your schema file
const HiddenPost = require("../models/HiddenPosts.js");
const { getPresignedUrl } = require("../utils/cachePresignedUrl.js");
const { extractTimeOnly } = require("../utils/extractTimeOnly.js");
const { enrichComments } = require("../utils/userPosts.js");
const { isPromoActive, isPromoLaterToday } = require("../utils/enrichBusinesses.js");

/* ----------------------------------------------------------------------------
 * GET /promotion/:promotionId  -> single promotion (enriched)
 * -------------------------------------------------------------------------- */
router.get("/promotion/:promotionId", async (req, res) => {
  const { promotionId } = req.params;

  try {
    const promo = await Promotion.findById(promotionId).lean();
    if (!promo) return res.status(404).json({ message: "Promotion not found" });

    // Time context
    const now = new Date();
    const nowLocal = DateTime.fromJSDate(now).toLocal();
    const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;

    // Determine kind (assumes helpers support date + start/endTime)
    let kind = "inactivePromo";
    if (isPromoActive(promo, nowMinutes, now)) {
      kind = "activePromo";
    } else if (isPromoLaterToday(promo, nowMinutes, now)) {
      kind = "upcomingPromo";
    }

    // Enrich comments
    const enrichedComments = await enrichComments(promo.comments || []);

    // Enrich photos (generate presigned URLs on read)
    const enrichedPhotos = await Promise.all(
      (promo.photos || []).map(async (photo) => {
        const url = photo?.photoKey ? await getPresignedUrl(photo.photoKey) : null;
        return { ...photo, url };
      })
    );

    // Enrich business name
    let businessName = null;
    if (promo.placeId) {
      const business = await Business.findOne({ placeId: promo.placeId }, { businessName: 1 }).lean();
      businessName = business?.businessName || null;
    }

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

/* ----------------------------------------------------------------------------
 * GET /:placeId  -> all promotions for a business (enriched, hidden filtered)
 * -------------------------------------------------------------------------- */
router.get("/:placeId", async (req, res) => {
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

    // Fetch business + hidden ids in parallel
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
            { userId: new mongoose.Types.ObjectId(viewerId), targetRef: "Promotion" },
            { targetId: 1, _id: 0 }
          ).lean();
          return (rows || [])
            .map((r) => r?.targetId)
            .filter(Boolean)
            .map((id) => new mongoose.Types.ObjectId(String(id)));
        } catch (e) {
          console.warn("[GET /promotions/:placeId] hidden fetch failed:", e?.message);
          return [];
        }
      })(),
    ]);

    if (!business) {
      console.warn(`⚠️ Business not found for placeId: ${placeId}`);
      return res.status(404).json({ message: "Business not found" });
    }

    const businessLogoUrl = business.logoKey ? await safePresign(business.logoKey) : null;

    const promoQuery = { placeId };
    if (hiddenPromotionObjIds.length) {
      promoQuery._id = { $nin: hiddenPromotionObjIds };
    }

    const promotions = await Promotion.find(promoQuery).lean();

    const enhanced = await Promise.all(
      promotions.map(async (promo) => {
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
          comments,
          kind: "promo",
          ownerId: business._id?.toString?.() || null,
          businessName: business.businessName || "Unknown",
          businessLogoUrl,
        };
      })
    );

    res.json({ promotions: enhanced, businessLogoUrl });
  } catch (err) {
    console.error("🔥 Unexpected error in GET /:placeId promotions route:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ----------------------------------------------------------------------------
 * POST /  -> create promotion (schema-aligned)
 * Body: { placeId, title, description, date, allDay, startTime, endTime, recurring, recurringDays, photos }
 * -------------------------------------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const {
      placeId,
      title,
      description,
      date,          // ✅ single date per schema
      allDay,
      startTime,
      endTime,
      recurring,
      recurringDays,
      photos,
    } = req.body;

    const business = await Business.findOne({ placeId });
    if (!business) return res.status(404).json({ message: "Business not found" });
    const uploaderId = business._id;

    // Only stable fields in DB
    const photoObjects = (photos || []).map((p) => ({
      photoKey: p.photoKey,
      description: p.description || null,
      uploadDate: new Date(),
      uploadedBy: uploaderId,
    }));

    const doc = new Promotion({
      placeId,
      title,
      description,

      date: date || null,
      allDay: allDay ?? true,
      startTime: (allDay ?? true) ? null : extractTimeOnly(startTime),
      endTime:   (allDay ?? true) ? null : extractTimeOnly(endTime),

      recurring: recurring ?? false,
      recurringDays: (recurring ?? false) ? (recurringDays || []) : [],

      photos: photoObjects,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await doc.save();

    // Response-only decorations are fine
    const promoWithKind = saved.toObject();
    promoWithKind.kind = "Promo";
    promoWithKind.ownerId = business._id;

    res.status(201).json({ message: "Promotion created successfully", promotion: promoWithKind });
  } catch (err) {
    console.error("Error creating promotion:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ----------------------------------------------------------------------------
 * PUT /:promotionId  -> update promotion (schema-aligned, no presigned URL storage)
 * -------------------------------------------------------------------------- */
router.put("/:promotionId", async (req, res) => {
  try {
    const { promotionId } = req.params;
    const {
      title,
      description,
      date,
      allDay,
      startTime,
      endTime,
      recurring,
      recurringDays,
      photos,
    } = req.body;

    const updateFields = { updatedAt: new Date() };

    // Simple fields
    const simple = { title, description, date, allDay, recurring };
    for (const [k, v] of Object.entries(simple)) {
      if (v !== undefined) updateFields[k] = v;
    }

    // Time normalization
    if (allDay !== undefined) {
      if (allDay) {
        updateFields.startTime = null;
        updateFields.endTime = null;
      } else {
        if (startTime !== undefined) updateFields.startTime = extractTimeOnly(startTime);
        if (endTime   !== undefined) updateFields.endTime   = extractTimeOnly(endTime);
      }
    } else {
      if (startTime !== undefined) updateFields.startTime = extractTimeOnly(startTime);
      if (endTime   !== undefined) updateFields.endTime   = extractTimeOnly(endTime);
    }

    // Recurring + days
    if (recurring !== undefined) {
      updateFields.recurringDays = recurring ? (recurringDays || []) : [];
    } else if (recurringDays !== undefined) {
      updateFields.recurringDays = recurringDays;
    }

    // Photos: store only stable fields (no presigned URLs)
    if (photos !== undefined) {
      updateFields.photos = (photos || []).map((p) => ({
        photoKey: p.photoKey,
        description: p.description || null,
        uploadDate: p.uploadDate ? new Date(p.uploadDate) : new Date(),
      }));
    }

    const updated = await Promotion.findByIdAndUpdate(promotionId, updateFields, { new: true });
    if (!updated) return res.status(404).json({ message: "Promotion not found" });

    res.json({
      message: "Promotion updated successfully",
      promotion: {
        ...updated.toObject(),
        kind: "Promo",
        // If you want an owner reference in response, you can resolve from business by placeId if needed.
      },
    });
  } catch (err) {
    console.error("Error updating promotion:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ----------------------------------------------------------------------------
 * DELETE /:promotionId  -> delete promotion
 * (You can add S3 deletion of media keys here if desired)
 * -------------------------------------------------------------------------- */
router.delete("/:promotionId", async (req, res) => {
  try {
    const { promotionId } = req.params;
    const deleted = await Promotion.findByIdAndDelete(promotionId);

    if (!deleted) return res.status(404).json({ message: "Promotion not found" });

    // Optional: collect deleted.photos[].photoKey and bulk delete from S3 here.
    res.json({ message: "Promotion deleted successfully" });
  } catch (err) {
    console.error("Error deleting promotion:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
