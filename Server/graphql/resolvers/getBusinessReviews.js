const mongoose = require('mongoose');
const Business = require('../../models/Business');
const Review = require('../../models/Reviews');
const CheckIn = require('../../models/CheckIns');
const HiddenPost = require('../../models/HiddenPosts');
const { resolveUserProfilePics, resolveTaggedPhotoUsers, resolveTaggedUsers, enrichComments } = require('../../utils/userPosts');

const getAuthUserId = (ctx) =>
  ctx?.user?._id?.toString?.() || ctx?.user?.id || ctx?.user?.userId || null;

const getBusinessReviews = async (_, { placeId, limit = 15, after }, context) => {
  try {
    if (!placeId) throw new Error("Invalid placeId");

    const business = await Business.findOne({ placeId }).lean();
    if (!business) return [];

    const businessName = business.businessName;
    const baseFilter = { placeId };

    // ——— Load viewer's hidden IDs (Review / CheckIn) ———
    const viewerId = getAuthUserId(context);
    const viewerObjId = viewerId && mongoose.Types.ObjectId.isValid(viewerId)
      ? new mongoose.Types.ObjectId(viewerId)
      : null;

    let hiddenReviewIds = [];
    let hiddenCheckInIds = [];

    if (viewerObjId) {
      try {
        const rows = await HiddenPost.find(
          { userId: viewerObjId },
          { targetRef: 1, targetId: 1, _id: 0 }
        ).lean();

        const reviewIds = [];
        const checkInIds = [];
        for (const r of rows || []) {
          if (r?.targetRef === 'Review') reviewIds.push(String(r.targetId));
          if (r?.targetRef === 'CheckIn') checkInIds.push(String(r.targetId));
        }

        const toObjIds = (arr) => arr.map((id) => new mongoose.Types.ObjectId(String(id)));
        hiddenReviewIds = reviewIds.length ? toObjIds(reviewIds) : [];
        hiddenCheckInIds = checkInIds.length ? toObjIds(checkInIds) : [];
      } catch (e) {
        console.warn('[getBusinessReviews] hidden fetch failed:', e?.message);
      }
    }

    // ——— DB-level exclusion using $nin ———
    const reviewFilter = hiddenReviewIds.length
      ? { ...baseFilter, _id: { $nin: hiddenReviewIds } }
      : baseFilter;

    const checkInFilter = hiddenCheckInIds.length
      ? { ...baseFilter, _id: { $nin: hiddenCheckInIds } }
      : baseFilter;

    // Fetch and enrich REVIEWS
    const reviewsRaw = await Review.find(reviewFilter).lean();
    const reviewUserIds = reviewsRaw.map(r => r.userId?.toString()).filter(Boolean);
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
    const checkInsRaw = await CheckIn.find(checkInFilter).lean();
    const checkInUserIds = checkInsRaw.map(ci => ci.userId?.toString()).filter(Boolean);
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
