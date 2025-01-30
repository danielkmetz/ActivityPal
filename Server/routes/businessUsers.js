const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const BusinessUser = require("../models/Business"); // Update with your schema location

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

module.exports = router;
