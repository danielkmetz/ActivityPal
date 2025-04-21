const { User } = require("../models/User");
const { Business } = require("../models/Business");
const { generateDownloadPresignedUrl } = require("../helpers/generateDownloadPresignedUrl.js");

async function gatherUserReviews(userObjectId, profilePic, profilePicUrl) {
  const businesses = await Business.find({ "reviews.userId": userObjectId }).lean();
  const userIdStr = userObjectId.toString();
  const reviews = [];

  for (const business of businesses) {
    const filteredReviews = business.reviews.filter(r => r.userId.toString() === userIdStr);
    for (const review of filteredReviews) {
      const taggedUsers = await resolveTaggedUsers(review.taggedUsers);
      const photos = await resolveTaggedPhotoUsers(review.photos);

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
    }
  }

  return reviews;
}

async function gatherUserCheckIns(user, profilePicUrl) {
  if (!user.checkIns?.length) return [];

  const checkIns = await Promise.all(
    user.checkIns.map(async (checkIn) => {
      const business = checkIn.placeId
        ? await Business.findOne({ placeId: checkIn.placeId }).select("businessName")
        : null;

      const taggedUsers = await resolveTaggedUsers(checkIn.taggedUsers);
      const photos = await resolveTaggedPhotoUsers(checkIn.photos);

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
        photos,
        likes: checkIn.likes || [],
        comments: checkIn.comments || [],
        type: "check-in",
      };
    })
  );

  return checkIns;
}

async function resolveTaggedUsers(taggedUserIds = []) {
  if (!Array.isArray(taggedUserIds) || taggedUserIds.length === 0) return [];

  const users = await User.find({ _id: { $in: taggedUserIds } }, { firstName: 1, lastName: 1 });
  return users.map(u => ({
    _id: u._id,
    fullName: `${u.firstName} ${u.lastName}`,
  }));
}

async function resolveTaggedPhotoUsers(photos = []) {
  if (!Array.isArray(photos)) return [];

  return await Promise.all(
    photos.map(async (photo) => {
      const taggedUserIds = Array.isArray(photo.taggedUsers)
        ? photo.taggedUsers.map(tag => tag.userId).filter(Boolean)
        : [];

      const users = taggedUserIds.length
        ? await User.find({ _id: { $in: taggedUserIds } }, { firstName: 1, lastName: 1 })
        : [];

      const taggedUsersWithCoords = Array.isArray(photo.taggedUsers)
        ? photo.taggedUsers.map(tag => {
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
        ...photo,
        url: await generateDownloadPresignedUrl(photo.photoKey),
        taggedUsers: taggedUsersWithCoords,
      };
    })
  );
}

module.exports = {
  gatherUserReviews,
  gatherUserCheckIns,
};
