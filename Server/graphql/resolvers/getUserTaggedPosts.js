const mongoose = require('mongoose');
const User = require('../../models/User');
const Review = require('../../models/Reviews');
const CheckIn = require('../../models/CheckIns');
const {
  toFlatResponseFromCanonical,
  createNormalizerContext,
} = require('../../utils/normalizePostStructure'); // adjust path if needed
const { getHiddenIdsForUser } = require('../../utils/hiddenTags'); // adjust path if needed

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id));

const getUserTaggedPosts = async (_, { userId, limit = 15, after }) => {
  try {
    if (!isValidId(userId)) throw new Error('Invalid userId');

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const userIdStr = userObjectId.toString();

    const user = await User.findById(userObjectId).select('_id').lean();
    if (!user) throw new Error('User not found');

    const { hiddenReviewIds = [], hiddenCheckInIds = [] } =
      await getHiddenIdsForUser(userObjectId);

    const reviewQuery = {
      userId: { $ne: userObjectId },
      ...(hiddenReviewIds.length ? { _id: { $nin: hiddenReviewIds } } : {}),
      $or: [
        { taggedUsers: userObjectId },
        { 'photos.taggedUsers.userId': userIdStr },
      ],
    };

    const checkInQuery = {
      userId: { $ne: userObjectId },
      ...(hiddenCheckInIds.length ? { _id: { $nin: hiddenCheckInIds } } : {}),
      $or: [
        { taggedUsers: userObjectId },
        { 'photos.taggedUsers.userId': userIdStr },
      ],
    };

    const [reviewsRaw, checkInsRaw] = await Promise.all([
      Review.find(reviewQuery).sort({ date: -1 }).lean(),
      CheckIn.find(checkInQuery).sort({ date: -1 }).lean(),
    ]);

    const { normalizers } = createNormalizerContext();

    const [normalizedReviews, normalizedCheckIns] = await Promise.all([
      Promise.all(reviewsRaw.map((r) => normalizers.review(r))),
      Promise.all(checkInsRaw.map((c) => normalizers['check-in'](c))),
    ]);

    const flatReviews = normalizedReviews
      .filter((r) => typeof r?.rating === 'number' && r.rating >= 1)
      .map((r) => {
        const o = toFlatResponseFromCanonical(r);
        return { __typename: 'Review', ...o };
      });

    const flatCheckIns = normalizedCheckIns.map((c) => {
      const o = toFlatResponseFromCanonical(c);
      delete o.rating;
      delete o.priceRating;
      delete o.atmosphereRating;
      delete o.serviceRating;
      delete o.wouldRecommend;
      delete o.reviewText;
      return { __typename: 'CheckIn', ...o };
    });

    let flat = [...flatReviews, ...flatCheckIns].map((p) => ({
      ...p,
      sortDate: p.date,
    }));

    flat.sort((a, b) => {
      const dateDiff = new Date(b.sortDate) - new Date(a.sortDate);
      if (dateDiff !== 0) return dateDiff;
      const aId = new mongoose.Types.ObjectId(a._id).toString();
      const bId = new mongoose.Types.ObjectId(b._id).toString();
      return bId.localeCompare(aId);
    });

    if (after?.sortDate && after?.id) {
      const afterTime = new Date(after.sortDate).getTime();
      const afterObjectId = new mongoose.Types.ObjectId(after.id).toString();

      flat = flat.filter((post) => {
        const postTime = new Date(post.sortDate).getTime();
        const postId = new mongoose.Types.ObjectId(post._id).toString();
        return postTime < afterTime || (postTime === afterTime && postId < afterObjectId);
      });
    }

    const out = flat.slice(0, limit);

    const safeOut = out.filter(
      (x) => x.__typename !== 'Review' || (typeof x.rating === 'number' && x.rating >= 1)
    );

    return safeOut;
  } catch (error) {
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = { getUserTaggedPosts };
