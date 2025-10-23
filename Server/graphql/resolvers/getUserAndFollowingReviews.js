const mongoose = require('mongoose');
const User = require('../../models/User');
const { gatherUserReviews, resolveUserProfilePics } = require('../../utils/userPosts');

const getUserAndFollowingReviews = async (_, { userId, excludeAuthorIds = [] }, ctx) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1) Load following once
    const user = await User.findById(userObjectId)
      .select('following')
      .lean();
    if (!user) throw new Error('User not found');

    // 2) Build candidate author set (me + following)
    //    Normalize everything to strings for reliable comparison
    const followingIds = (user.following || []).map(id => String(id));
    const candidateIdsStr = [String(userObjectId), ...followingIds];

    // 3) Push-down block filter: remove any authors in excludeAuthorIds
    const excludeSet = new Set(excludeAuthorIds.map(id => String(id)));
    const allowedIdsStr = candidateIdsStr.filter(id => !excludeSet.has(id));

    // (Optional) Ensure unique ids
    const allowedIdsStrUnique = Array.from(new Set(allowedIdsStr));

    // Early exit if nothing left
    if (allowedIdsStrUnique.length === 0) return [];

    // 4) Convert back to ObjectIds for queries
    const allowedIds = allowedIdsStrUnique.map(id => new mongoose.Types.ObjectId(id));

    // 5) Fetch allowed users’ basic profiles (only those not blocked)
    const users = await User.find({ _id: { $in: allowedIds } })
      .select('_id firstName lastName profilePic')
      .lean();

    // 6) Resolve pics only for allowed authors
    const picMap = await resolveUserProfilePics(allowedIds);

    // 7) Gather reviews per allowed author
    const allReviewsNested = await Promise.all(
      users.map(async (u) => {
        const uid = String(u._id);
        const profileMeta = picMap[uid] || {};
        // gatherUserReviews already scopes to this author, so no need to pass excludeAuthorIds again
        return gatherUserReviews(u._id, profileMeta.profilePic, profileMeta.profilePicUrl);
      })
    );

    const allReviews = allReviewsNested.flat();

    // 8) Sort newest-first
    const sorted = allReviews
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return sorted;
  } catch (error) {
    console.error('❌ Error in getUserAndFollowingReviews:', error);
    throw new Error('Failed to fetch user and following reviews');
  }
};

module.exports = { getUserAndFollowingReviews };
