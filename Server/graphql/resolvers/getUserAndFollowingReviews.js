const mongoose = require('mongoose');
const User = require('../../models/User');
const { gatherUserReviews } = require('../../utils/userPosts');
const { resolveUserProfilePics } = require('../../utils/userPosts');

const getUserAndFollowingReviews = async (_, { userId }) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid userId format");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 🔍 Get user's following list
    const user = await User.findById(userObjectId)
      .select('following')
      .lean();

    if (!user) {
      throw new Error("User not found");
    }

    const following = user.following || [];
    const allUserIds = [userObjectId, ...following];

    // 👤 Get user names and profile photos
    const users = await User.find({ _id: { $in: allUserIds } })
      .select('_id firstName lastName profilePic')
      .lean();

    const picMap = await resolveUserProfilePics(allUserIds);

    // 🧠 Enrich each user's reviews using the helper
    const allReviewsNested = await Promise.all(
      users.map(async (user) => {
        const userIdStr = user._id.toString();
        const profileMeta = picMap[userIdStr] || {};
        return gatherUserReviews(user._id, profileMeta.profilePic, profileMeta.profilePicUrl);
      })
    );

    const allReviews = allReviewsNested.flat();

    // 🕒 Sort by latest date
    const sorted = allReviews
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return sorted;

  } catch (error) {
    console.error("❌ Error in getUserAndFollowingReviews:", error);
    throw new Error("Failed to fetch user and following reviews");
  }
};

module.exports = {
  getUserAndFollowingReviews,
};
