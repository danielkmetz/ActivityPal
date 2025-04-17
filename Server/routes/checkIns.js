const express = require("express");
const User = require("../models/User"); // User model (contains checkIns)
const router = express.Router();
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');

// ✅ Create a new check-in (Save to User schema)
const mongoose = require("mongoose");

router.post("/post", async (req, res) => {
  try {
    const { userId, placeId, message, photos, taggedUsers, businessName, fullName } = req.body;

    // Ensure userId is an ObjectId
    const mongoUserId = new mongoose.Types.ObjectId(userId);
    const date = Date.now();

    // Fetch user profile picture
    const user = await User.findById(userId).select("profilePic");
    let profilePicUrl = null;
    if (user?.profilePic?.photoKey) {
      profilePicUrl = await generateDownloadPresignedUrl(user.profilePic.photoKey);
    }

    // Convert taggedUsers array into ObjectId format
    const taggedUserIds = taggedUsers.map(id => new mongoose.Types.ObjectId(id));

    // Convert `photos` array into `PhotoSchema` format and generate presigned URLs
    const photoObjects = await Promise.all(
      photos.map(async (photo) => {
        const downloadUrl = await generateDownloadPresignedUrl(photo.photoKey);

        // Ensure tagged users contain userId, x, and y
        const formattedTaggedUsers = photo.taggedUsers.map(tag => ({
          userId: tag.userId,  // ObjectId of the user
          x: tag.x,            // X coordinate
          y: tag.y             // Y coordinate
        }));

        return {
          _id: new mongoose.Types.ObjectId(),
          photoKey: photo.photoKey,
          uploadedBy: userId,
          description: photo.description || null,
          taggedUsers: formattedTaggedUsers, // Store tagged users with coordinates
          uploadDate: date,
          url: downloadUrl,
        };
      })
    );

    // Fetch user details for tagged users in the review
    const taggedUserDetails = await User.find(
      { _id: { $in: taggedUsers } },
      { firstName: 1, lastName: 1 }
    );

    const newCheckIn = {
      _id: new mongoose.Types.ObjectId(),
      userId: mongoUserId, // Convert to ObjectId
      placeId, // Leave as string
      message,
      photos: photoObjects,
      taggedUsers: taggedUserIds, // Convert array to ObjectIds
      date,
    };

    // Update user document and push check-in into their checkIns array
    const updatedUser = await User.findByIdAndUpdate(
      mongoUserId,
      { $push: { checkIns: newCheckIn } },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    };

    const createdCheckIn = updatedUser.checkIns[updatedUser.checkIns.length - 1];

    // Populate tagged users in the response (Only for frontend display)
    const populatedTaggedUsers = taggedUserDetails.map(user => ({
      userId: user._id,
      fullName: `${user.firstName} ${user.lastName}`,
    }));

    // Fetch full names for tagged users inside each photo for the response
    const populatedPhotoObjects = await Promise.all(
      photoObjects.map(async (photo) => {
        const photoTaggedUserDetails = await User.find(
          { _id: { $in: photo.taggedUsers.map(tag => tag.userId) } },
          { firstName: 1, lastName: 1 }
        );

        return {
          ...photo,
          taggedUsers: photoTaggedUserDetails.map(user => ({
            userId: user._id,
            fullName: `${user.firstName} ${user.lastName}`,
            x: photo.taggedUsers.find(tag => tag.userId.toString() === user._id.toString())?.x,
            y: photo.taggedUsers.find(tag => tag.userId.toString() === user._id.toString())?.y,
          })), // Full names with x, y coordinates in response
        };
      })
    );

    // Format response
    const checkInResponse = {
      _id: createdCheckIn._id,
      placeId,
      userId,
      message,
      fullName,
      businessName,
      profilePicUrl,
      taggedUsers: populatedTaggedUsers, // Full names for frontend
      date,
      photos: populatedPhotoObjects, // Photos with tagged users' full names and coordinates
      type: "check-in",
    };

    res.status(201).json({ success: true, data: checkInResponse });
  } catch (error) {
    console.error("❌ Error creating check-in:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/:userId/:checkInId", async (req, res) => {
  const { userId, checkInId } = req.params;
  const { placeId, checkInText, taggedUsers, photos } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const checkInIndex = user.checkIns.findIndex(c => c._id.toString() === checkInId);
    if (checkInIndex === -1) return res.status(404).json({ message: "Check-in not found" });

    const checkIn = user.checkIns[checkInIndex];

    if (checkInText !== undefined) checkIn.checkInText = checkInText;
    if (placeId !== undefined) checkIn.placeId = placeId;

    const taggedUserDocs = await User.find({ _id: { $in: taggedUsers || [] } }, 'firstName lastName');
    checkIn.taggedUsers = taggedUserDocs.map(u => u._id);

    if (Array.isArray(photos)) {
      checkIn.photos = await Promise.all(
        photos.map(async (photo) => {
          const formattedTagged = Array.isArray(photo.taggedUsers)
            ? photo.taggedUsers.map(tag => ({
                userId: tag.userId,
                x: tag.x,
                y: tag.y,
              }))
            : [];

          return {
            photoKey: photo.photoKey,
            uploadedBy: user._id,
            description: photo.description || null,
            taggedUsers: formattedTagged,
            uploadDate: new Date(),
          };
        })
      );
    }

    await user.save();

    const profilePicUrl = user.profilePic?.photoKey
      ? await generateDownloadPresignedUrl(user.profilePic.photoKey)
      : null;

    const populatedTaggedUsers = taggedUserDocs.map(user => ({
      _id: user._id,
      fullName: `${user.firstName} ${user.lastName}`,
    }));

    const populatedPhotos = await Promise.all(
      checkIn.photos.map(async (photo) => {
        const taggedUserDetails = await User.find(
          { _id: { $in: photo.taggedUsers.map(t => t.userId) } },
          'firstName lastName'
        );

        const userMap = new Map(taggedUserDetails.map(u => [u._id.toString(), u]));

        const formattedTags = photo.taggedUsers.map(tag => {
          const user = userMap.get(tag.userId.toString());
          return {
            _id: tag.userId,
            fullName: user ? `${user.firstName} ${user.lastName}` : 'Unknown User',
            x: tag.x,
            y: tag.y,
          };
        });

        return {
          ...photo.toObject(),
          url: await generateDownloadPresignedUrl(photo.photoKey),
          taggedUsers: formattedTags,
        };
      })
    );

    res.status(200).json({
      message: "Check-in updated successfully",
      checkIn: {
        _id: checkIn._id,
        placeId: checkIn.placeId,
        userId: user._id,
        fullName: `${user.firstName} ${user.lastName}`,
        profilePic: user.profilePic || null,
        profilePicUrl,
        checkInText: checkIn.checkInText,
        taggedUsers: populatedTaggedUsers,
        date: checkIn.date,
        photos: populatedPhotos,
        type: "check-in",
        likes: checkIn.likes || [],
      },
    });
  } catch (error) {
    console.error("🚨 Error updating check-in:", error);
    res.status(500).json({ message: "Server error" });
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
