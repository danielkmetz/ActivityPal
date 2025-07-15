const mongoose = require('mongoose');
const User = require('../../models/User');
const SharedPost = require('../../models/SharedPost');
const { getPresignedUrl } = require('../../utils/cachePresignedUrl');
const {
  gatherUserReviews,
  gatherUserCheckIns,
  resolveUserProfilePics,
  enrichSharedPost
} = require('../../utils/userPosts');

const getUserPosts = async (_, { userId, limit = 15, after }) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const user = await User.findById(userObjectId).select(
      '_id profilePic firstName lastName'
    );

    if (!user) {
      console.warn('⚠️ User not found for ID:', userId);
      throw new Error('User not found');
    }

    const photoKey = user.profilePic?.photoKey || null;
    const profilePicUrl = photoKey ? await getPresignedUrl(photoKey) : null;

    const reviews = await gatherUserReviews(userObjectId, user.profilePic, profilePicUrl);
    const checkIns = await gatherUserCheckIns(user, profilePicUrl);

    const sharedPostsRaw = await SharedPost.find({ user: userObjectId })
      .sort({ createdAt: -1 })
      .lean();

    const profilePicMap = await resolveUserProfilePics([
      user._id.toString(),
      ...sharedPostsRaw.map(sp => sp.originalOwner?.toString()).filter(Boolean),
    ]);

    const enrichedSharedPosts = await Promise.all(
      sharedPostsRaw.map(async (shared) => {
        const enrichedOriginal = await enrichSharedPost(shared, profilePicMap);
        if (!enrichedOriginal) return null;

        return {
          ...shared,
          original: enrichedOriginal,
          user: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePic: user.profilePic,
            profilePicUrl,
          },
          originalOwner: {
            _id: shared.originalOwner,
            ...profilePicMap[shared.originalOwner?.toString()],
          },
          sortDate: shared.createdAt?.toISOString(),
          type: 'sharedPost',
        };
      })
    );

    const sharedPosts = enrichedSharedPosts.filter(Boolean);

    const allPosts = [
      ...reviews.map(post => ({ ...post, sortDate: post.date })),
      ...checkIns.map(post => ({ ...post, sortDate: post.date })),
      ...sharedPosts,
    ];

    let sorted = allPosts.sort((a, b) => {
      const dateDiff = new Date(b.sortDate) - new Date(a.sortDate);
      if (dateDiff !== 0) return dateDiff;
      return new mongoose.Types.ObjectId(b._id).toString().localeCompare(
        new mongoose.Types.ObjectId(a._id).toString()
      );
    });

    if (after?.sortDate && after?.id) {
      const afterTime = new Date(after.sortDate).getTime();
      const afterObjectId = new mongoose.Types.ObjectId(after.id).toString();

      sorted = sorted.filter(post => {
        const postTime = new Date(post.sortDate).getTime();
        const postId = new mongoose.Types.ObjectId(post._id).toString();

        return (
          postTime < afterTime ||
          (postTime === afterTime && postId < afterObjectId)
        );
      });
    }

    return sorted.slice(0, limit);
  } catch (error) {
    console.error('[❌ Resolver Error] getUserPosts failed:', error);
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = {
  getUserPosts,
};
