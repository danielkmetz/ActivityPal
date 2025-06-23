const User = require("../models/User");
const Business = require("../models/Business");
const CheckIn = require('../models/CheckIns.js');
const Review = require('../models/Reviews.js');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

async function gatherUserReviews(userObjectId, profilePic, profilePicUrl) {
  try {
    const reviews = await Review.find({ userId: userObjectId }).lean();

    const enriched = await Promise.all(
      reviews.map(async (review) => {
        try {
          const [taggedUsers, rawPhotos, business] = await Promise.all([
            resolveTaggedUsers(review.taggedUsers || []),
            resolveTaggedPhotoUsers(review.photos || []),
            Business.findOne({ placeId: review.placeId }).select('businessName').lean(),
          ]);

          const photos = (rawPhotos || []).filter(p => p && p._id && p.photoKey);

          return {
            __typename: "Review",
            ...review,
            businessName: business?.businessName || null,
            placeId: review.placeId,
            date: new Date(review.date).toISOString(),
            profilePic,
            profilePicUrl,
            taggedUsers,
            photos,
            type: "review",
          };
        } catch (err) {
          console.error(`❌ Error enriching review ${review._id}:`, err);
          return null;
        }
      })
    );

    return enriched.filter(r => r !== null);
  } catch (err) {
    console.error("❌ Error in gatherUserReviews:", err);
    return [];
  }
}

async function gatherUserCheckIns(user, profilePicUrl) {
  try {
    const checkIns = await CheckIn.find({ userId: user._id }).lean();
    console.log(`📦 Found ${checkIns.length} check-ins for user ${user._id}`);

    const enriched = await Promise.all(
      checkIns.map(async (checkIn) => {
        try {
          console.log(`➡️ Processing check-in: ${checkIn._id}`);
          console.log(`   placeId: ${checkIn.placeId}`);

          const [taggedUsers, rawPhotos, business] = await Promise.all([
            resolveTaggedUsers(checkIn.taggedUsers || []),
            resolveTaggedPhotoUsers(checkIn.photos || []),
            Business.findOne({ placeId: checkIn.placeId?.trim() })
              .select('businessName placeId')
              .lean(),
          ]);

          if (!business) {
            console.warn(`⚠️ No matching business found for placeId: "${checkIn.placeId}"`);
          } else {
            console.log(`✅ Found business: ${business.businessName} (placeId: ${business.placeId})`);
          }

          const photos = (rawPhotos || []).filter(p => p && p._id && p.photoKey);

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
            businessName: business?.businessName || "Unknown Business",
            taggedUsers,
            photos,
            likes: checkIn.likes || [],
            comments: checkIn.comments || [],
            type: "check-in",
          };
        } catch (err) {
          console.error(`❌ Error enriching check-in ${checkIn._id}:`, err);
          return null;
        }
      })
    );

    return enriched.filter(Boolean);
  } catch (err) {
    console.error("❌ Error in gatherUserCheckIns:", err);
    return [];
  }
}

async function resolveTaggedUsers(taggedUserIds = []) {
  if (!Array.isArray(taggedUserIds) || taggedUserIds.length === 0) return [];

  const ids = taggedUserIds.map(id => id?.toString()).filter(Boolean);

  const users = await User.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1 });
  return users.map(u => ({
    userId: u._id,
    fullName: `${u.firstName} ${u.lastName}`,
  }));
}

async function resolveTaggedPhotoUsers(photos = []) {
  if (!Array.isArray(photos)) return [];

  const cleanPhotos = photos.map(p => p.toObject?.() || p).filter(p => p?.photoKey);

  const allTaggedIds = new Set();
  for (const photo of cleanPhotos) {
    (photo.taggedUsers || []).forEach(tag => tag?.userId && allTaggedIds.add(tag.userId.toString()));
  }

  const taggedUserArray = [...allTaggedIds];
  const taggedUserMap = {};
  if (taggedUserArray.length) {
    const users = await User.find({ _id: { $in: taggedUserArray } }, { firstName: 1, lastName: 1 });
    for (const u of users) {
      taggedUserMap[u._id.toString()] = `${u.firstName} ${u.lastName}`;
    }
  }

  // 🔁 Batch presigned URL generation
  const urlMap = {};
  await Promise.all(cleanPhotos.map(async (p) => {
    urlMap[p.photoKey] = await getPresignedUrl(p.photoKey);
  }));

  return cleanPhotos.map(photo => {
    const enrichedTags = (photo.taggedUsers || []).map(tag => ({
      userId: tag.userId,
      fullName: taggedUserMap[tag.userId?.toString()] || "Unknown User",
      x: tag.x || 0,
      y: tag.y || 0,
    }));

    return {
      ...photo,
      url: urlMap[photo.photoKey],
      taggedUsers: enrichedTags,
    };
  });
}

async function resolveUserProfilePics(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) return {};

  const users = await User.find({ _id: { $in: userIds } }).select('_id profilePic');

  // 🔁 Get all photoKeys first
  const urlMap = {};
  await Promise.all(
    users.map(async user => {
      const photoKey = user.profilePic?.photoKey;
      if (photoKey) urlMap[photoKey] = await getPresignedUrl(photoKey);
    })
  );

  const userPicMap = {};
  for (const user of users) {
    const photoKey = user.profilePic?.photoKey;
    userPicMap[user._id.toString()] = {
      profilePic: user.profilePic || null,
      profilePicUrl: photoKey ? urlMap[photoKey] : null,
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
