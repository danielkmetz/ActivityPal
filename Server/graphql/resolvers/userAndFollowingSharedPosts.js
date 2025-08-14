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
      // keep _id explicit so it’s never excluded by accident
      .populate('user', '_id firstName lastName profilePic')
      .populate('originalOwner', '_id firstName lastName profilePic')
      .lean();

    // collect IDs we can actually resolve pics for (only if present)
    const uniqueUserIds = [
      ...new Set([
        ...allUserIds.map(id => id.toString()),
        ...sharedPostsRaw.map(sp => sp.user?._id?.toString()).filter(Boolean),
        ...sharedPostsRaw.map(sp => sp.originalOwner?._id?.toString()).filter(Boolean),
      ]),
    ];

    const profilePicMap = await resolveUserProfilePics(uniqueUserIds);

    // simple helper to create a "tombstone" placeholder
    const tombstone = (label = 'Deleted User') => ({
      id: 'DELETED_USER',
      firstName: label,
      lastName: null,
      profilePicUrl: null,
      profilePic: null,
    });

    const enriched = await Promise.all(
      sharedPostsRaw.map(async (shared, idx) => {
        // Run enrichment (still may return null for bad originals; we’ll skip then)
        const enrichedOriginal = await enrichSharedPost(shared, profilePicMap, userLat, userLng);
        if (!enrichedOriginal) {
          console.warn(`⚠️ Skipped shared post at index ${idx} (enrichment failed): ${shared._id}`);
          return null;
        }

        // Enrich comments on the shared post itself
        const enrichedComments = await enrichComments(shared.comments || []);

        // Build safe user block
        let userBlock;
        if (!shared.user) {
          console.warn(`⚠️ Shared post ${shared._id} missing "user" — using tombstone`);
          userBlock = tombstone('Deleted User');
        } else {
          const userIdStr = shared.user._id?.toString?.() || shared.user.id || 'UNKNOWN_ID';
          const pic = profilePicMap[userIdStr] || {};
          userBlock = {
            id: userIdStr,
            firstName: shared.user.firstName || null,
            lastName: shared.user.lastName || null,
            profilePicUrl: pic.profilePicUrl ?? null,
            profilePic: pic.profilePic ?? null,
          };
        }

        // Build safe originalOwner block
        let ownerBlock;
        if (!shared.originalOwner) {
          console.warn(`⚠️ Shared post ${shared._id} missing "originalOwner" — using tombstone`);
          ownerBlock = tombstone('Deleted User');
        } else {
          const ownerIdStr = shared.originalOwner._id?.toString?.() || shared.originalOwner.id || 'UNKNOWN_ID';
          const pic = profilePicMap[ownerIdStr] || {};
          ownerBlock = {
            id: ownerIdStr,
            firstName: shared.originalOwner.firstName || null,
            lastName: shared.originalOwner.lastName || null,
            profilePicUrl: pic.profilePicUrl ?? null,
            profilePic: pic.profilePic ?? null,
          };
        }

        console.log(`✅ Enriched shared post #${idx + 1}`, {
          sharedId: String(shared._id),
          originalPostType: enrichedOriginal.originalPostType,
          typename: enrichedOriginal.__typename,
        });

        return {
          _id: shared._id,
          user: userBlock,
          originalOwner: ownerBlock,
          originalPostId: shared.originalPostId?.toString?.() || shared.originalPostId,
          postType: shared.postType,
          caption: shared.caption,
          createdAt: shared.createdAt,
          updatedAt: shared.updatedAt,
          type: 'sharedPost',
          likes: shared.likes || [],
          comments: enrichedComments,
          original: enrichedOriginal.original, // Review / CheckIn / Event / Promotion / ActivityInvite
        };
      })
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
