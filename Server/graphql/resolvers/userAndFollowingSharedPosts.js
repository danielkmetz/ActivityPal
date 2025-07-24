const mongoose = require('mongoose');
const SharedPost = require('../../models/SharedPost');
const User = require('../../models/User');
const { enrichSharedPost, enrichComments } = require('../../utils/userPosts');
const { resolveUserProfilePics } = require('../../utils/userPosts');

const getUserAndFollowingSharedPosts = async (_, { userId, userLat = null, userLng = null }) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error('❌ Invalid userId format:', userId);
      throw new Error('Invalid userId format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userObjectId).select('following').lean();
    if (!user) {
      console.error('❌ User not found:', userId);
      throw new Error('User not found');
    }

    const followingIds = user.following || [];
    const allUserIds = [userObjectId, ...followingIds];

    const sharedPostsRaw = await SharedPost.find({ user: { $in: allUserIds } })
      .sort({ createdAt: -1 })
      .populate('user', 'firstName lastName profilePic')
      .populate('originalOwner', 'firstName lastName profilePic')
      .lean();

    const uniqueUserIds = [
      ...new Set([
        ...allUserIds.map(id => id.toString()),
        ...sharedPostsRaw.map(sp => sp.originalOwner?._id?.toString()).filter(Boolean),
      ]),
    ];

    const profilePicMap = await resolveUserProfilePics(uniqueUserIds);

    const enriched = await Promise.all(
      sharedPostsRaw.map(async (shared, idx) => {
        const enrichedOriginal = await enrichSharedPost(shared, profilePicMap, userLat, userLng);
        if (!enrichedOriginal) {
          console.warn(`⚠️ Skipped shared post at index ${idx} (enrichment failed)`, shared._id);
          return null;
        }

        const enrichedComments = await enrichComments(shared.comments || []);

        console.log(`✅ Enriched shared post #${idx + 1}`, {
          sharedId: shared._id,
          originalPostType: enrichedOriginal.originalPostType,
          typename: enrichedOriginal.__typename,
        });

        return {
          _id: shared._id,
          user: {
            id: shared.user._id.toString(),
            firstName: shared.user.firstName,
            lastName: shared.user.lastName,
            ...profilePicMap[shared.user._id.toString()],
          },
          originalOwner: {
            id: shared.originalOwner._id.toString(),
            firstName: shared.originalOwner.firstName,
            lastName: shared.originalOwner.lastName,
            ...profilePicMap[shared.originalOwner._id.toString()],
          },
          originalPostId: shared.originalPostId,
          postType: shared.postType,
          caption: shared.caption,
          createdAt: shared.createdAt,
          updatedAt: shared.updatedAt,
          type: 'sharedPost',
          likes: shared.likes || [],
          comments: enrichedComments,
          original: enrichedOriginal.original,
        };
      })
    );

    const filtered = enriched.filter(Boolean);
    return filtered;
  } catch (err) {
    console.error('❌ Error in getUserAndFollowingSharedPosts resolver:', err);
    throw new Error('Failed to fetch user and following shared posts');
  }
};

module.exports = {
  getUserAndFollowingSharedPosts,
};
