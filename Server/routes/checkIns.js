const express = require("express");
const User = require("../models/User"); // User model (contains checkIns)
const Business = require('../models/Business.js');
const CheckIn = require('../models/CheckIns.js');
const router = express.Router();
const { resolveTaggedPhotoUsers, resolveTaggedUsers, resolveUserProfilePics } = require('../utils/userPosts.js');

// ✅ Create a new check-in (Save to User schema)
const mongoose = require("mongoose");

router.post("/post", async (req, res) => {
  try {
    const { userId, placeId, message, photos, taggedUsers, businessName, location, fullName } = req.body;
    const mongoUserId = new mongoose.Types.ObjectId(userId);
    const date = Date.now();

    const user = await User.findById(userId).select("profilePic");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // 🔍 Ensure business exists or create placeholder
    let business = await Business.findOne({ placeId });
    if (!business) {
      business = await new Business({
        placeId,
        businessName: businessName || "Unknown Business",
        location: {
          type: "Point",
          coordinates: [0, 0],
          formattedAddress: location?.formattedAddress || "Unknown Address",
        },
        firstName: "N/A",
        lastName: "N/A",
        email: "N/A",
        password: "N/A",
        events: [],
        reviews: [],
      }).save();
    }

    // 📸 Build photo schema entries
    const photoObjects = await Promise.all(
      (photos || []).map(async (photo) => {
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

    // 🏷️ Prepare top-level CheckIn document
    const newCheckIn = new CheckIn({
      userId: mongoUserId,
      placeId,
      message,
      photos: photoObjects,
      taggedUsers: taggedUsers.map(id => new mongoose.Types.ObjectId(id)),
      date,
    });

    await newCheckIn.save();

    // 🌐 Enrich response
    const [populatedTaggedUsers, populatedPhotos, profileMap] = await Promise.all([
      resolveTaggedUsers(newCheckIn.taggedUsers),
      resolveTaggedPhotoUsers(photoObjects),
      resolveUserProfilePics([userId]),
    ]);

    const profileData = profileMap[userId.toString()] || {
      profilePic: null,
      profilePicUrl: null,
    };

    const checkInResponse = {
      _id: newCheckIn._id,
      placeId,
      userId,
      fullName,
      businessName: business.businessName,
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

router.put("/:userId/:checkInId", async (req, res) => {
  const { userId, checkInId } = req.params;
  const { placeId, message, taggedUsers = [], photos = [] } = req.body;

  try {
    const user = await User.findById(userId).select("firstName lastName profilePic");
    if (!user) return res.status(404).json({ message: "User not found" });

    const checkIn = await CheckIn.findById(checkInId);
    if (!checkIn) return res.status(404).json({ message: "Check-in not found" });

    const business = await Business.findOne({ placeId });
    if (!business) return res.status(404).json({ message: "Business not found" });

    // 🧠 Store old tags
    const oldTaggedUserIds = (checkIn.taggedUsers || []).map(id => id.toString());
    const oldPhotos = checkIn.photos || [];
    const oldPhotoTaggedUserIds = oldPhotos.flatMap(p =>
      (p.taggedUsers || []).map(tag => tag.userId?.toString())
    );

    const oldPhotosByKey = new Map();
    oldPhotos.forEach(photo => {
      if (photo.photoKey) oldPhotosByKey.set(photo.photoKey, photo);
    });

    // ✍️ Apply updates
    checkIn.message = message;
    checkIn.placeId = placeId;
    checkIn.taggedUsers = taggedUsers.map(t => t.userId || t._id || t);

    const newPhotoTaggedUserIds = [];
    const newPhotosByKey = new Map();

    checkIn.photos = await Promise.all(
      photos.map(photo => {
        const formattedTags = (photo.taggedUsers || []).map(tag => {
          newPhotoTaggedUserIds.push(tag.userId?.toString());
          return {
            userId: tag.userId,
            x: tag.x,
            y: tag.y,
          };
        });
        newPhotosByKey.set(photo.photoKey, photo);

        return {
          photoKey: photo.photoKey,
          uploadedBy: checkIn.userId,
          description: photo.description || null,
          taggedUsers: formattedTags,
          uploadDate: new Date(),
        };
      })
    );

    await checkIn.save();

    // 🧾 Compare photo diffs
    const deletedPhotoKeys = [...oldPhotosByKey.keys()].filter(k => !newPhotosByKey.has(k));
    const addedPhotoKeys = [...newPhotosByKey.keys()].filter(k => !oldPhotosByKey.has(k));

    const removedPhotoTaggedUserIds = deletedPhotoKeys.flatMap(k =>
      oldPhotosByKey.get(k)?.taggedUsers?.map(tag => tag.userId?.toString()) || []
    );
    const addedPhotoTaggedUserIds = addedPhotoKeys.flatMap(k =>
      newPhotosByKey.get(k)?.taggedUsers?.map(tag => tag.userId?.toString()) || []
    );

    // 🧠 Tag diffing
    const oldSet = new Set([...oldTaggedUserIds, ...oldPhotoTaggedUserIds]);
    const newSet = new Set([...checkIn.taggedUsers.map(String), ...newPhotoTaggedUserIds, ...addedPhotoTaggedUserIds]);

    const removed = [...oldSet].filter(id => !newSet.has(id));
    const added = [...newSet].filter(id => !oldSet.has(id));

    // ❌ Remove old notifications
    await Promise.all(removed.map(uid =>
      User.findByIdAndUpdate(uid, {
        $pull: { notifications: { targetId: checkIn._id } },
      })
    ));

    // ✅ Add new notifications
    const notify = (userId, type, msg) => ({
      type,
      message: msg,
      targetId: checkIn._id,
      typeRef: "checkIn",
      senderId: user._id,
      date: new Date(),
      read: false,
    });

    await Promise.all(added.map(uid =>
      User.findByIdAndUpdate(uid, {
        $push: {
          notifications: notify(
            uid,
            newPhotoTaggedUserIds.includes(uid) ? "photoTag" : "tag",
            `${user.firstName} ${user.lastName} tagged you in a ${newPhotoTaggedUserIds.includes(uid) ? "photo" : "check-in"}.`
          ),
        },
      })
    ));

    // 📦 Enrich for response
    const [populatedTaggedUsers, enrichedPhotos, profileMap] = await Promise.all([
      resolveTaggedUsers(checkIn.taggedUsers),
      resolveTaggedPhotoUsers(checkIn.photos),
      resolveUserProfilePics([user._id]),
    ]);

    const profile = profileMap[user._id.toString()] || {
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
        profilePic: profile.profilePic,
        profilePicUrl: profile.profilePicUrl,
        checkInText: checkIn.message,
        taggedUsers: populatedTaggedUsers,
        date: checkIn.date,
        photos: enrichedPhotos,
        type: "check-in",
        likes: checkIn.likes || [],
      },
    });
  } catch (error) {
    console.error("🚨 Error updating check-in:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:userId/:checkInId", async (req, res) => {
  try {
    const { userId, checkInId } = req.params;
    const checkInObjectId = new mongoose.Types.ObjectId(checkInId);

    const [user, checkIn] = await Promise.all([
      User.findById(userId),
      CheckIn.findById(checkInId)
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!checkIn) {
      return res.status(404).json({ success: false, message: "Check-in not found" });
    }

    // 🏷️ Gather all tagged user IDs (from text and photo tags)
    const taggedUserIds = (checkIn.taggedUsers || []).map(id => id.toString());
    const photoTaggedUserIds = (checkIn.photos || []).flatMap(photo =>
      (photo.taggedUsers || []).map(tag => tag.userId?.toString())
    );

    const allTaggedUserIds = [...new Set([...taggedUserIds, ...photoTaggedUserIds])];

    // 🧹 Remove notifications related to this check-in
    const taggedCleanup = allTaggedUserIds.map(uid =>
      User.findByIdAndUpdate(uid, {
        $pull: { notifications: { targetId: checkInObjectId } },
      })
    );

    const creatorCleanup = User.findByIdAndUpdate(userId, {
      $pull: { notifications: { targetId: checkInObjectId } },
    });

    await Promise.all([...taggedCleanup, creatorCleanup]);

    // 🗑️ Delete the check-in document
    await CheckIn.findByIdAndDelete(checkInId);

    res.status(200).json({
      success: true,
      message: "Check-in and associated notifications deleted",
    });
  } catch (error) {
    console.error("❌ Error deleting check-in:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
