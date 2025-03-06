const express = require("express");
const User = require("../models/User"); // User model (contains checkIns)
const router = express.Router();

// ✅ Create a new check-in (Save to User schema)
const mongoose = require("mongoose");

router.post("/post", async (req, res) => {
  try {
    const { userId, placeId, message, photos, taggedUsers } = req.body;

    // Ensure userId is an ObjectId
    const mongoUserId = new mongoose.Types.ObjectId(userId);

    // Convert taggedUsers array into ObjectId format
    const taggedUserIds = taggedUsers.map(id => new mongoose.Types.ObjectId(id));

    const newCheckIn = {
      userId: mongoUserId, // Convert to ObjectId
      placeId, // Leave as string
      message,
      photos,
      taggedUsers: taggedUserIds, // Convert array to ObjectIds
      timestamp: new Date(),
    };

    // Update user document and push check-in into their checkIns array
    const updatedUser = await User.findByIdAndUpdate(
      mongoUserId,
      { $push: { checkIns: newCheckIn } },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(201).json({ success: true, data: newCheckIn });
  } catch (error) {
    console.error("❌ Error creating check-in:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Edit an existing check-in (Find user & update check-in)
router.put("/:userId/:checkInId", async (req, res) => {
  try {
    const { userId, checkInId } = req.params;
    const updates = req.body;

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, "checkIns._id": checkInId },
      { $set: { "checkIns.$": { ...updates, _id: checkInId } } }, // Update specific check-in
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    res.status(200).json({ success: true, data: updatedUser.checkIns });
  } catch (error) {
    console.error("❌ Error updating check-in:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Delete a check-in (Remove from user's checkIns array)
router.delete("/:userId/:checkInId", async (req, res) => {
  try {
    const { userId, checkInId } = req.params;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { checkIns: { _id: checkInId } } }, // Remove check-in from array
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    res.status(200).json({ success: true, message: "Check-in deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting check-in:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
