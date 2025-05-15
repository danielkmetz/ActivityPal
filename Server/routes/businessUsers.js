const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const BusinessUser = require("../models/Business"); // Update with your schema location
const mongoose = require('mongoose');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

// Update business info
router.patch("/update", verifyToken, async (req, res) => {
  const { placeId, location, description, phone, } =
    req.body;

  try {
    // Ensure placeId is provided in the request
    if (!placeId) {
      return res.status(400).json({ message: "placeId is required" });
    }

    // Find the business user by their placeId
    const businessUser = await BusinessUser.findOne({ placeId });

    if (!businessUser) {
      return res.status(404).json({ message: "Business user not found" });
    }

    // Update fields
    if (location !== undefined) businessUser.location = location;
    if (description !== undefined) businessUser.description = description;
    if (phone !== undefined) businessUser.phone = phone;
    
    // Save updated info
    const updatedUser = await businessUser.save();

    res.status(200).json({
      message: "Business info updated successfully",
      updatedUser,
    });
  } catch (error) {
    console.error("Error updating business info:", error);
    res
      .status(500)
      .json({ message: "An error occurred while updating business info" });
  }
});

router.get("/name/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Validate the ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid business user ID format" });
    }

    // Find the business user by their _id
    const businessUser = await BusinessUser.findById(id).select("businessName");

    if (!businessUser) {
      return res.status(404).json({ message: "Business user not found" });
    }

    res.status(200).json({ businessName: businessUser.businessName });
  } catch (error) {
    console.error("Error fetching business user name:", error);
    res.status(500).json({ message: "An error occurred while fetching business user name" });
  }
});

router.post("/favorites", verifyToken, async (req, res) => {
  const { businessIds } = req.body;

  try {
    // Validate input
    if (!businessIds || !Array.isArray(businessIds)) {
      return res.status(400).json({ message: "businessIds must be an array" });
    }

    // Fetch businesses using placeId (since it's stored as a string)
    const businesses = await BusinessUser.find({ placeId: { $in: businessIds } });

    if (!businesses.length) {
      return res.status(404).json({ message: "No businesses found for the provided IDs" });
    }

    // Generate presigned URLs for profile pictures
    const businessesWithPresignedUrls = await Promise.all(
      businesses.map(async (business) => {
        let profilePicUrl = null;

        if (business.logoKey) {
          profilePicUrl = await getPresignedUrl(business.logoKey);
        }

        return {
          ...business.toObject(),
          profilePicUrl, // Add presigned URL to response
        };
      })
    );

    res.status(200).json({ businesses: businessesWithPresignedUrls });
  } catch (error) {
    console.error("🚨 Error fetching favorite businesses:", error);
    res.status(500).json({ message: "An error occurred while fetching favorite businesses" });
  }
});

module.exports = router;
