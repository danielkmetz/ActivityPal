const express = require("express");
const router = express.Router();
const Business = require("../models/Business");
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');

// 📌 GET all promotions for a business using placeId
router.get("/:placeId", async (req, res) => {
    try {
      const { placeId } = req.params;
      const business = await Business.findOne({ placeId });
  
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
  
      const enhancedPromotions = await Promise.all(
        (business.promotions || []).map(async (promotion) => {
          if (Array.isArray(promotion.photos) && promotion.photos.length > 0) {
            const photosWithUrls = await Promise.all(
              promotion.photos.map(async (photo) => {
                const url = await generateDownloadPresignedUrl(photo.photoKey);
                return {
                  ...photo,
                  url,
                };
              })
            );
  
            return {
              ...promotion.toObject?.() ?? promotion,
              photos: photosWithUrls,
            };
          } else {
            return promotion.toObject?.() ?? promotion;
          }
        })
      );
  
      res.json(enhancedPromotions);
    } catch (error) {
      console.error("Error fetching promotions:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
});

// 📌 POST: Create a new promotion and save it to a business
router.post("/", async (req, res) => {
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

    // Convert `photos` array into `PhotoSchema` format and generate presigned URLs
    const photoObjects = await Promise.all(
      photos.map(async (photo) => {
        const downloadUrl = await generateDownloadPresignedUrl(photo.photoKey);

        return {
          photoKey: photo.photoKey,
          uploadedBy: placeId,
          description: photo.description || null,
          uploadDate: new Date(),
          url: downloadUrl,
        };
      })
    );

    // Create promotion object with all schema-supported fields
    const newPromotion = {
      title,
      description,
      startDate,
      endDate,
      isSingleDay: isSingleDay ?? true,
      allDay: allDay ?? true,
      startTime: allDay ? null : startTime ?? null,
      endTime: allDay ? null : endTime ?? null,
      recurring: recurring ?? false,
      recurringDays: recurring ? recurringDays || [] : [],
      photos: photoObjects,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    business.promotions.push(newPromotion);
    const savedBusiness = await business.save();

    const createdPromotion = savedBusiness.promotions[savedBusiness.promotions.length - 1];

    res.status(201).json({
      message: "Promotion created successfully",
      promotion: createdPromotion,
    });
  } catch (error) {
    console.error("Error creating promotion:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 PUT: Edit an existing promotion
router.put("/:promotionId", async (req, res) => {
  try {
    const { promotionId } = req.params;
    const {
      placeId,
      title,
      description,
      startDate,
      endDate,
      photos,
      recurring,
      recurringDays,
      startTime,
      endTime,
      isSingleDay,
      allDay,
    } = req.body;

    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const promotion = business.promotions.id(promotionId);
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    if (title !== undefined) promotion.title = title;
    if (description !== undefined) promotion.description = description;
    if (startDate !== undefined) promotion.startDate = startDate;
    if (endDate !== undefined) promotion.endDate = endDate;

    if (Array.isArray(photos)) {
      promotion.photos = photos;
    }    

    if (recurring !== undefined) promotion.recurring = recurring;
    if (recurring) {
      promotion.recurringDays = Array.isArray(recurringDays) ? recurringDays : [];
    } else {
      promotion.recurringDays = [];
    }

    if (isSingleDay !== undefined) promotion.isSingleDay = isSingleDay;
    if (allDay !== undefined) promotion.allDay = allDay;

    promotion.startTime = allDay ? null : startTime || null;
    promotion.endTime = allDay ? null : endTime || null;

    promotion.updatedAt = new Date();

    await business.save();
    res.json({ message: "Promotion updated successfully", promotion });
  } catch (error) {
    console.error("Error updating promotion:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📌 DELETE: Remove a promotion by ID
router.delete("/:promotionId", async (req, res) => {
  try {
    const { promotionId } = req.params;
    const { placeId } = req.body; // Ensure the request includes placeId

    const business = await Business.findOne({ placeId });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Remove promotion
    const updatedPromotions = business.promotions.filter((promo) => promo._id.toString() !== promotionId);
    if (updatedPromotions.length === business.promotions.length) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    business.promotions = updatedPromotions;
    await business.save();

    res.json({ message: "Promotion deleted successfully" });
  } catch (error) {
    console.error("Error deleting promotion:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
