const mongoose = require('mongoose');
const SharedPost = require('../../models/SharedPost');
const User = require('../../models/User');
const { enrichSharedPost } = require('../../utils/userPosts');
const { resolveUserProfilePics } = require('../../utils/userPosts');

const getUserAndFollowingSharedPosts = async (_, { userId }) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userObjectId).select('following').lean();
    if (!user) throw new Error('User not found');

    const followingIds = user.following || [];
    const allUserIds = [userObjectId, ...followingIds];

    const sharedPostsRaw = await SharedPost.find({ user: { $in: allUserIds } })
      .sort({ createdAt: -1 })
      .populate('user', 'firstName lastName profilePic')
      .populate('originalOwner', 'firstName lastName profilePic')
      .lean();

    // 🧠 Build profilePic map (used in enrichment)
    const profilePicMap = await resolveUserProfilePics([
      ...allUserIds,
      ...sharedPostsRaw.map(sp => sp.originalOwner?._id?.toString()).filter(Boolean),
    ]);

    // 🧠 Enrich shared posts using the helper
    const enriched = await Promise.all(
      sharedPostsRaw.map(shared => enrichSharedPost(shared, profilePicMap))
    );

    return enriched.filter(Boolean);
  } catch (err) {
    console.error('❌ Error in getUserAndFollowingSharedPosts resolver:', err);
    throw new Error('Failed to fetch user and following shared posts');
  }
};

module.exports = {
  getUserAndFollowingSharedPosts,
};
