const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { DateTime } = require("luxon");
const Business = require("../models/Business");
const Promotion = require("../models/Promotions.js"); // ✅ singular to match your schema file
const HiddenPost = require("../models/HiddenPosts.js");
const { getPresignedUrl } = require("../utils/cachePresignedUrl.js");
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
      photos = [],
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "Missing required fields: title, description" });
    }

    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const uploaderId = business._id;

    // ✅ Only stable fields in DB
    const photoObjects = photos.map((p) => ({
      photoKey: p.photoKey,
      description: p.description || null,
      uploadDate: new Date(),
      uploadedBy: uploaderId,
      // If your PhotoSchema supports this and you want parity with events:
      taggedUsers: Array.isArray(p.taggedUsers) ? p.taggedUsers : [],
    }));

    const doc = new Promotion({
      placeId,
      title,
      description,

      date: date || null,
      allDay: allDay ?? true,
      startTime: (allDay ?? true) ? null : startTime,
      endTime:   (allDay ?? true) ? null : endTime,

      recurring: recurring ?? false,
      recurringDays: (recurring ?? false) ? (recurringDays || []) : [],

      photos: photoObjects,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await doc.save();

    // 🔥 Enrichment for response (mirrors event endpoint behavior)
    const plain = saved.toObject();

    const enrichedPhotos = await Promise.all(
      (plain.photos || []).map(async (photo) => ({
        ...photo,
        url: await getPresignedUrl(photo.photoKey), // <- same enrichment as events
      }))
    );

    plain.photos = enrichedPhotos;
    plain.kind = "Promo";
    plain.ownerId = business._id;

    res.status(201).json({
      message: "Promotion created successfully",
      promotion: plain,
    });
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

    // 1) Load existing promotion so we can preserve uploadedBy, uploadDate, etc.
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    promotion.updatedAt = new Date();

    // Simple fields
    if (title !== undefined) promotion.title = title;
    if (description !== undefined) promotion.description = description;
    if (date !== undefined) promotion.date = date;
    if (allDay !== undefined) promotion.allDay = allDay;
    if (recurring !== undefined) promotion.recurring = recurring;

    // Time normalization
    if (allDay !== undefined) {
      if (allDay) {
        promotion.startTime = null;
        promotion.endTime = null;
      } else {
        if (startTime !== undefined) promotion.startTime = startTime;
        if (endTime   !== undefined) promotion.endTime   = endTime;
      }
    } else {
      if (startTime !== undefined) promotion.startTime = startTime;
      if (endTime   !== undefined) promotion.endTime   = endTime;
    }

    // Recurring + days
    if (recurring !== undefined) {
      promotion.recurringDays = recurring ? (recurringDays || []) : [];
    } else if (recurringDays !== undefined) {
      promotion.recurringDays = recurringDays;
    }

    // 3) Photos: preserve uploadedBy / uploadDate, set for new photos
    if (photos !== undefined) {
      const existingByKey = new Map(
        (promotion.photos || []).map((p) => [p.photoKey, p])
      );

      // Try to reuse existing uploadedBy; if none, fall back to business for this placeId
      let defaultUploaderId = null;
      const existingWithUploader = (promotion.photos || []).find(
        (p) => p.uploadedBy
      );
      if (existingWithUploader?.uploadedBy) {
        defaultUploaderId = existingWithUploader.uploadedBy;
      } else if (promotion.placeId) {
        const biz = await Business.findOne({ placeId: promotion.placeId }, "_id");
        defaultUploaderId = biz ? biz._id : null;
      }

      promotion.photos = (photos || []).map((p) => {
        const prev = existingByKey.get(p.photoKey) || {};

        return {
          photoKey: p.photoKey,
          description:
            p.description !== undefined ? p.description : (prev.description || null),

          // keep original uploadDate if present, otherwise use incoming or now
          uploadDate: p.uploadDate
            ? new Date(p.uploadDate)
            : prev.uploadDate || new Date(),

          // ✅ preserve or set uploadedBy
          uploadedBy: p.uploadedBy || prev.uploadedBy || defaultUploaderId || null,

          // if your PhotoSchema supports taggedUsers, preserve them too
          taggedUsers: Array.isArray(p.taggedUsers)
            ? p.taggedUsers
            : prev.taggedUsers || [],
        };
      });
    }

    const saved = await promotion.save();

    // 4) Enrich for response: presigned URLs + ownerId + kind (parity with Event endpoint)
    const plain = saved.toObject();

    const enrichedPhotos = await Promise.all(
      (plain.photos || []).map(async (photo) => ({
        ...photo,
        url: await getPresignedUrl(photo.photoKey),
      }))
    );

    plain.photos = enrichedPhotos;
    plain.kind = "Promo";

    // Resolve ownerId the same way as POST / (business via placeId)
    let ownerId = null;
    if (plain.placeId) {
      const biz = await Business.findOne({ placeId: plain.placeId }, "_id");
      if (biz) ownerId = biz._id;
    }
    plain.ownerId = ownerId;

    res.json({
      message: "Promotion updated successfully",
      promotion: plain,
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
