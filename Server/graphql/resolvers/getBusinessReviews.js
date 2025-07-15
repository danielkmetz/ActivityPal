const mongoose = require('mongoose');
const Business = require('../../models/Business');
const Review = require('../../models/Reviews');
const CheckIn = require('../../models/CheckIns');
const { resolveUserProfilePics, resolveTaggedPhotoUsers, resolveTaggedUsers, enrichComments } = require('../../utils/userPosts');

const getBusinessReviews = async (_, { placeId, limit = 15, after }) => {
  try {
    if (!placeId) throw new Error("Invalid placeId");

    const business = await Business.findOne({ placeId }).lean();
    if (!business) return [];

    const businessName = business.businessName;
    const baseFilter = { placeId };

    // Fetch and enrich REVIEWS
    const reviewsRaw = await Review.find(baseFilter).lean();
    const reviewUserIds = reviewsRaw.map(r => r.userId?.toString());
    const reviewPicMap = await resolveUserProfilePics(reviewUserIds);

    const enrichedReviews = await Promise.all(
      reviewsRaw.map(async (review) => {
        const taggedUsers = await resolveTaggedUsers(review.taggedUsers || []);
        const rawPhotos = await resolveTaggedPhotoUsers(review.photos || []);
        const photos = rawPhotos.filter(p => p?.photoKey);
        const enrichedComments = enrichComments(review.comments || []);

        return {
          __typename: 'Review',
          ...review,
          type: 'review',
          businessName,
          sortDate: new Date(review.date).toISOString(),
          date: new Date(review.date).toISOString(),
          profilePic: reviewPicMap[review.userId?.toString()]?.profilePic || null,
          profilePicUrl: reviewPicMap[review.userId?.toString()]?.profilePicUrl || null,
          taggedUsers,
          comments: enrichedComments,
          photos,
        };
      })
    );

    // Fetch and enrich CHECK-INS
    const checkInsRaw = await CheckIn.find(baseFilter).lean();
    const checkInUserIds = checkInsRaw.map(ci => ci.userId?.toString());
    const checkInPicMap = await resolveUserProfilePics(checkInUserIds);

    const enrichedCheckIns = await Promise.all(
      checkInsRaw.map(async (checkIn) => {
        const taggedUsers = await resolveTaggedUsers(checkIn.taggedUsers || []);
        const rawPhotos = await resolveTaggedPhotoUsers(checkIn.photos || []);
        const enrichedComments = enrichComments(checkIn.comments || []);
        const photos = rawPhotos.filter(p => p?.photoKey);

        return {
          __typename: 'CheckIn',
          ...checkIn,
          type: 'check-in',
          businessName,
          sortDate: new Date(checkIn.date).toISOString(),
          date: new Date(checkIn.date).toISOString(),
          profilePic: checkInPicMap[checkIn.userId?.toString()]?.profilePic || null,
          profilePicUrl: checkInPicMap[checkIn.userId?.toString()]?.profilePicUrl || null,
          comments: enrichedComments,
          taggedUsers,
          photos,
        };
      })
    );

    // Combine, sort, and paginate
    let allPosts = [...enrichedReviews, ...enrichedCheckIns];

    allPosts.sort((a, b) => {
      const dateDiff = new Date(b.sortDate) - new Date(a.sortDate);
      if (dateDiff !== 0) return dateDiff;
      return new mongoose.Types.ObjectId(b._id).toString().localeCompare(
        new mongoose.Types.ObjectId(a._id).toString()
      );
    });

    if (after?.sortDate && after?.id) {
      const afterTime = new Date(after.sortDate).getTime();
      const afterId = new mongoose.Types.ObjectId(after.id).toString();

      allPosts = allPosts.filter(post => {
        const postTime = new Date(post.sortDate).getTime();
        const postId = new mongoose.Types.ObjectId(post._id).toString();
        return (
          postTime < afterTime ||
          (postTime === afterTime && postId < afterId)
        );
      });
    }

    return allPosts.slice(0, limit);
  } catch (error) {
    console.error("❌ Error in getBusinessReviews:", error);
    throw new Error("Failed to fetch business reviews");
  }
};

module.exports = {
  getBusinessReviews,
};
