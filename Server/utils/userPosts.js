const User = require("../models/User");
const Business  = require("../models/Business");
const { generateDownloadPresignedUrl } = require("../helpers/generateDownloadPresignedUrl.js");

async function gatherUserReviews(userObjectId, profilePic, profilePicUrl) {
  let businesses;
  try {
    businesses = await Business.find({ "reviews.userId": userObjectId }).lean();
  } catch (err) {
    throw new Error("Database error during business fetch");
  }

  const userIdStr = userObjectId.toString();
  const reviews = [];

  for (const business of businesses) {
    if (!business.reviews || !Array.isArray(business.reviews)) continue;

    const filteredReviews = business.reviews.filter(r => {
      try {
        return r.userId?.toString?.() === userIdStr;
      } catch {
        return false;
      }
    });

    for (const review of filteredReviews) {
      try {
        const taggedUsers = await resolveTaggedUsers(review.taggedUsers || []);
        const rawPhotos = await resolveTaggedPhotoUsers(review.photos || []);
        const photos = (rawPhotos || []).filter(p => p && p._id && p.photoKey);

        reviews.push({
          __typename: "Review",
          ...review,
          businessName: business.businessName,
          placeId: business.placeId,
          date: new Date(review.date).toISOString(),
          profilePic,
          profilePicUrl,
          taggedUsers,
          photos,
          type: "review",
        });
      } catch {}
    }
  }

  return reviews;
}

async function gatherUserCheckIns(user, profilePicUrl) {
  if (!Array.isArray(user.checkIns) || !user.checkIns.length) {
    return [];
  }

  const checkIns = await Promise.all(
    user.checkIns.map(async (checkIn) => {
      try {
        const business = checkIn.placeId
          ? await Business.findOne({ placeId: checkIn.placeId }).select("businessName")
          : null;

        const taggedUsers = await resolveTaggedUsers(checkIn.taggedUsers || []);
        const photos = (checkIn.photos || []).map(p => p.toObject ? p.toObject() : p);
        const rawPhotos = await resolveTaggedPhotoUsers(photos);
        const filtered = (rawPhotos || []).filter(p => p && p.photoKey);     

        return {
          __typename: "CheckIn",
          _id: checkIn._id,
          userId: user._id,
          fullName: `${user.firstName} ${user.lastName}`,
          message: checkIn.message,
          date: new Date(checkIn.date).toISOString(),
          profilePic: user.profilePic || null,
          profilePicUrl,
          placeId: checkIn.placeId || null,
          businessName: business?.businessName || null,
          taggedUsers,
          photos: filtered,
          likes: checkIn.likes || [],
          comments: checkIn.comments || [],
          type: "check-in",
        };
      } catch {
        return null;
      }
    })
  );

  return checkIns.filter(c => c !== null);
}

async function resolveTaggedPhotoUsers(photos = []) {
  if (!Array.isArray(photos)) return [];

  return await Promise.all(
    photos.map(async (photo) => {
      const clean = photo.toObject ? photo.toObject() : photo;
      if (!clean || !clean._id || !clean.photoKey) {
        console.warn('⚠️ Skipping invalid photo in resolveTaggedPhotoUsers:', clean);
        return null;
      }
  
      const taggedUserIds = Array.isArray(clean.taggedUsers)
        ? clean.taggedUsers.map(tag => tag.userId).filter(Boolean)
        : [];
  
      const users = taggedUserIds.length
        ? await User.find({ _id: { $in: taggedUserIds } }, { firstName: 1, lastName: 1 })
        : [];
  
      const taggedUsersWithCoords = Array.isArray(clean.taggedUsers)
        ? clean.taggedUsers.map(tag => {
            const user = users.find(u => u._id.toString() === tag.userId?.toString());
            return {
              _id: tag.userId,
              fullName: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
              x: tag.x || 0,
              y: tag.y || 0,
            };
          })
        : [];
  
      return {
        ...clean,
        url: await generateDownloadPresignedUrl(clean.photoKey),
        taggedUsers: taggedUsersWithCoords,
      };
    })
  ).then(results => results.filter(Boolean));  
}

async function resolveTaggedUsers(taggedUserIds = []) {
  if (!Array.isArray(taggedUserIds) || taggedUserIds.length === 0) return [];

  const ids = taggedUserIds.map(id => id?.toString()).filter(Boolean);

  const users = await User.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1 });
  return users.map(u => ({
    _id: u._id,
    fullName: `${u.firstName} ${u.lastName}`,
  }));
}

async function resolveUserProfilePics(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) return {};

  const users = await User.find({ _id: { $in: userIds } }).select('_id profilePic');
  const userPicMap = {};

  for (const user of users) {
    const photoKey = user.profilePic?.photoKey || null;
    userPicMap[user._id.toString()] = {
      profilePic: user.profilePic || null,
      profilePicUrl: photoKey ? await generateDownloadPresignedUrl(photoKey) : null,
    };
  }

  return userPicMap;
}

module.exports = {
  gatherUserReviews,
  gatherUserCheckIns,
  resolveTaggedUsers,
  resolveTaggedPhotoUsers,
  resolveUserProfilePics,
};
