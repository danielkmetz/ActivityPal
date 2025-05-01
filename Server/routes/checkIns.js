const express = require("express");
const User = require("../models/User"); // User model (contains checkIns)
const Business = require('../models/Business.js');
const router = express.Router();
const { resolveTaggedPhotoUsers, resolveTaggedUsers, resolveUserProfilePics } = require('../utils/userPosts.js');

// ✅ Create a new check-in (Save to User schema)
const mongoose = require("mongoose");

router.post("/post", async (req, res) => {
  try {
    const { userId, placeId, message, photos, taggedUsers, businessName, fullName } = req.body;

    const mongoUserId = new mongoose.Types.ObjectId(userId);
    const date = Date.now();

    const user = await User.findById(userId).select("profilePic");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Generate photo schema objects for DB
    const photoObjects = await Promise.all(
      photos.map(async (photo) => {
        const formattedTagged = Array.isArray(photo.taggedUsers)
          ? photo.taggedUsers.map(tag => ({
            userId: tag.userId,
            x: tag.x,
            y: tag.y,
          }))
          : [];

        return {
          _id: new mongoose.Types.ObjectId(),
          photoKey: photo.photoKey,
          uploadedBy: mongoUserId,
          description: photo.description || null,
          taggedUsers: formattedTagged,
          uploadDate: date,
        };
      })
    );

    // Prepare check-in object
    const taggedUserIds = taggedUsers.map(id => new mongoose.Types.ObjectId(id));
    const newCheckIn = {
      _id: new mongoose.Types.ObjectId(),
      userId: mongoUserId,
      placeId,
      message,
      photos: photoObjects,
      taggedUsers: taggedUserIds,
      date,
    };

    // Save check-in to user document
    const updatedUser = await User.findByIdAndUpdate(
      mongoUserId,
      { $push: { checkIns: newCheckIn } },
      { new: true, runValidators: true }
    );

    if (!updatedUser) return res.status(404).json({ success: false, message: "User not found after update" });

    const createdCheckIn = updatedUser.checkIns[updatedUser.checkIns.length - 1];

    // ✅ Use helpers for enriched response
    const [populatedTaggedUsers, populatedPhotos, profileMap] = await Promise.all([
      resolveTaggedUsers(taggedUserIds),
      resolveTaggedPhotoUsers(photoObjects),
      resolveUserProfilePics([userId]),
    ]);

    const profileData = profileMap[userId.toString()] || {
      profilePic: null,
      profilePicUrl: null,
    };

    const checkInResponse = {
      _id: createdCheckIn._id,
      placeId,
      userId,
      fullName,
      businessName,
      message,
      profilePic: profileData.profilePic,
      profilePicUrl: profileData.profilePicUrl,
      taggedUsers: populatedTaggedUsers,
      date,
      photos: populatedPhotos,
      type: "check-in",
    };

    res.status(201).json({ success: true, data: checkInResponse });
  } catch (error) {
    console.error("❌ Error creating check-in:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

//Edit a check-in and remove/add notifications from tagged users
router.put("/:userId/:checkInId", async (req, res) => {
  const { userId, checkInId } = req.params;
  const { placeId, message, taggedUsers, photos } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const business = await Business.findOne({ placeId });
    if (!business) return res.status(404).json({ message: "Business not found" });

    const checkInIndex = user.checkIns.findIndex(c => c._id.toString() === checkInId);
    if (checkInIndex === -1) return res.status(404).json({ message: "Check-in not found" });

    const checkIn = user.checkIns[checkInIndex];

    // 1. Store old tags
    const previousTaggedUserIds = checkIn.taggedUsers?.map(id => id.toString()) || [];
    const previousPhotos = checkIn.photos || [];
    const previousPhotoTaggedUserIds = previousPhotos.flatMap(photo =>
      (photo.taggedUsers || []).map(tag => tag.userId?.toString())
    );

    const previousPhotosByKey = new Map();
    previousPhotos.forEach((photo) => {
      if (photo.photoKey) {
        previousPhotosByKey.set(photo.photoKey, photo);
      }
    });

    // 2. Apply edits
    if (message !== undefined) checkIn.message = message;
    if (placeId !== undefined) checkIn.placeId = placeId;

    const taggedUserIds = taggedUsers.map(t => t.userId || t._id || t);
    checkIn.taggedUsers = taggedUserIds;

    // 3. Process photos and collect new photo-tagged users
    const newPhotoTaggedUserIds = [];
    const newPhotosByKey = new Map();

    if (Array.isArray(photos)) {
      checkIn.photos = await Promise.all(
        photos.map(async (photo) => {
          const formattedTagged = Array.isArray(photo.taggedUsers)
            ? photo.taggedUsers.map(tag => {
                newPhotoTaggedUserIds.push(tag.userId?.toString());
                return {
                  userId: tag.userId,
                  x: tag.x,
                  y: tag.y,
                };
              })
            : [];

          newPhotosByKey.set(photo.photoKey, photo);

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

    // 4. Identify deleted and added photos
    const deletedPhotoKeys = [...previousPhotosByKey.keys()].filter(
      key => !newPhotosByKey.has(key)
    );
    const addedPhotoKeys = [...newPhotosByKey.keys()].filter(
      key => !previousPhotosByKey.has(key)
    );

    const removedPhotoTaggedUserIds = deletedPhotoKeys.flatMap((key) => {
      const photo = previousPhotosByKey.get(key);
      return photo?.taggedUsers?.map(tag => tag.userId?.toString()) || [];
    });

    const addedPhotoTaggedUserIds = addedPhotoKeys.flatMap((key) => {
      const photo = newPhotosByKey.get(key);
      return photo?.taggedUsers?.map(tag => tag.userId?.toString()) || [];
    });

    await user.save();

    // 5. Tag diffing
    const currentTaggedSet = new Set(taggedUserIds.map(String));
    const currentPhotoTaggedSet = new Set([
      ...newPhotoTaggedUserIds,
      ...addedPhotoTaggedUserIds,
    ]);

    const oldTaggedSet = new Set(previousTaggedUserIds);
    const oldPhotoTaggedSet = new Set([
      ...previousPhotoTaggedUserIds,
      ...removedPhotoTaggedUserIds,
    ]);

    const checkInTagsAdded = [...currentTaggedSet].filter(id => !oldTaggedSet.has(id));
    const checkInTagsRemoved = [...oldTaggedSet].filter(id => !currentTaggedSet.has(id));

    const photoTagsAdded = [...currentPhotoTaggedSet].filter(id => !oldPhotoTaggedSet.has(id));
    const photoTagsRemoved = [...oldPhotoTaggedSet].filter(id => !currentPhotoTaggedSet.has(id));

    // 6. Remove notifications from users no longer tagged
    const removalIds = [...new Set([...checkInTagsRemoved, ...photoTagsRemoved])];
    const removalPromises = removalIds.map(userId =>
      User.findByIdAndUpdate(userId, {
        $pull: { notifications: { targetId: checkIn._id } },
      })
    );

    // 7. Add notifications to newly tagged users
    const additionPromises = [
      ...checkInTagsAdded.map(userId =>
        User.findByIdAndUpdate(userId, {
          $push: {
            notifications: {
              type: "tagged",
              message: `${user.firstName} ${user.lastName} tagged you in a check-in.`,
              targetId: checkIn._id,
              typeRef: "check-in",
              senderId: user._id,
              date: new Date(),
              read: false,
            },
          },
        })
      ),
      ...photoTagsAdded.map(userId =>
        User.findByIdAndUpdate(userId, {
          $push: {
            notifications: {
              type: "tagged-photo",
              message: `${user.firstName} ${user.lastName} tagged you in a photo.`,
              targetId: checkIn._id,
              typeRef: "check-in",
              senderId: user._id,
              date: new Date(),
              read: false,
            },
          },
        })
      ),
    ];

    await Promise.all([...removalPromises, ...additionPromises]);

    // 8. Enrich and return updated check-in
    const [populatedTaggedUsers, populatedPhotos, profileMap] = await Promise.all([
      resolveTaggedUsers(taggedUserIds),
      resolveTaggedPhotoUsers(checkIn.photos),
      resolveUserProfilePics([user._id]),
    ]);

    const profileData = profileMap[user._id.toString()] || {
      profilePic: null,
      profilePicUrl: null,
    };

    res.status(200).json({
      message: "Check-in updated successfully",
      checkIn: {
        _id: checkIn._id,
        placeId: checkIn.placeId,
        businessName: business.businessName,
        userId: user._id,
        fullName: `${user.firstName} ${user.lastName}`,
        profilePic: profileData.profilePic,
        profilePicUrl: profileData.profilePicUrl,
        checkInText: checkIn.message,
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
    const checkInObjectId = new mongoose.Types.ObjectId(checkInId);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const checkIn = user.checkIns.id(checkInId);
    if (!checkIn) {
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    // Extract tagged users
    const taggedUsers = checkIn.taggedUsers?.map(id => id.toString()) || [];
    const photoTaggedUsers = checkIn.photos?.flatMap(photo =>
      (photo.taggedUsers || []).map(tag => tag.userId?.toString())
    ) || [];

    const allTaggedUserIds = [...new Set([...taggedUsers, ...photoTaggedUsers])];

    // Clean up notifications for all tagged users
    const taggedUserNotificationCleanup = allTaggedUserIds.map(userId =>
      User.findByIdAndUpdate(userId, {
        $pull: { notifications: { targetId: checkInObjectId } },
      })
    );

    // Clean up notifications from the creator
    const creatorNotificationCleanup = User.findByIdAndUpdate(userId, {
      $pull: { notifications: { targetId: checkInObjectId } },
    });

    // Delete the check-in manually
    user.checkIns = user.checkIns.filter(c => c._id.toString() !== checkInId);
    await user.save();

    await Promise.all([...taggedUserNotificationCleanup, creatorNotificationCleanup]);

    res.status(200).json({
      success: true,
      message: "Check-in and related notifications deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting check-in:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
