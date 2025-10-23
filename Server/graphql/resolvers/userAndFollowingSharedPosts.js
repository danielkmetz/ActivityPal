const mongoose = require('mongoose');
const SharedPost = require('../../models/SharedPost');
const User = require('../../models/User');
const { enrichSharedPost, enrichComments, resolveUserProfilePics } = require('../../utils/userPosts');

const getUserAndFollowingSharedPosts = async (
  _,
  { userId, userLat = null, userLng = null, excludeAuthorIds = [] },
  ctx
) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error('❌ Invalid userId format:', userId);
      throw new Error('Invalid userId format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 👥 Fetch following list
    const user = await User.findById(userObjectId).select('following').lean();
    if (!user) {
      console.error('❌ User not found:', userId);
      throw new Error('User not found');
    }

    // Build candidate sharers (me + following) as strings
    const followingIds = (user.following || []).map(String);
    const candidateSharerIdsStr = [String(userObjectId), ...followingIds];

    // 🚫 Push-down block filter
    const excludeSet = new Set((excludeAuthorIds || []).map(String));
    const allowedSharerIdsStr = Array.from(
      new Set(candidateSharerIdsStr.filter(id => !excludeSet.has(id)))
    );

    // Nothing left? Done.
    if (allowedSharerIdsStr.length === 0) return [];

    // Convert back to ObjectIds for the query
    const allowedSharerIds = allowedSharerIdsStr.map(id => new mongoose.Types.ObjectId(id));

    // Prepare exclude list as ObjectIds for originalOwner $nin
    const excludeOids = (excludeAuthorIds || [])
      .map(id => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : null))
      .filter(Boolean);

    // 🔎 Query: only posts shared by allowed users AND not from blocked original owners
    const sharedPostsRaw = await SharedPost.find({
      user: { $in: allowedSharerIds },
      ...(excludeOids.length ? { originalOwner: { $nin: excludeOids } } : {}),
    })
      .sort({ createdAt: -1 })
      .populate('user', '_id firstName lastName profilePic')
      .populate('originalOwner', '_id firstName lastName profilePic')
      .lean();

    // Collect IDs for pic resolution (only what we actually need)
    const uniqueUserIds = [
      ...new Set([
        ...allowedSharerIdsStr,
        ...sharedPostsRaw.map(sp => sp.user?._id?.toString()).filter(Boolean),
        ...sharedPostsRaw.map(sp => sp.originalOwner?._id?.toString()).filter(Boolean),
      ]),
    ];

    const profilePicMap = await resolveUserProfilePics(uniqueUserIds);

    const tombstone = (label = 'Deleted User') => ({
      id: 'DELETED_USER',
      firstName: label,
      lastName: null,
      profilePicUrl: null,
      profilePic: null,
    });

    const enriched = await Promise.all(
      sharedPostsRaw.map(async (shared, idx) => {
        const enrichedOriginal = await enrichSharedPost(shared, profilePicMap, userLat, userLng);
        if (!enrichedOriginal) {
          console.warn(`⚠️ Skipped shared post at index ${idx} (enrichment failed): ${shared._id}`);
          return null;
        }

        const enrichedComments = await enrichComments(shared.comments || []);

        // Sharer block
        let userBlock;
        if (!shared.user) {
          console.warn(`⚠️ Shared post ${shared._id} missing "user" — using tombstone`);
          userBlock = tombstone('Deleted User');
        } else {
          const uid = shared.user._id?.toString?.() || shared.user.id || 'UNKNOWN_ID';
          const pic = profilePicMap[uid] || {};
          userBlock = {
            id: uid,
            firstName: shared.user.firstName || null,
            lastName: shared.user.lastName || null,
            profilePicUrl: pic.profilePicUrl ?? null,
            profilePic: pic.profilePic ?? null,
          };
        }

        // Original owner block
        let ownerBlock;
        if (!shared.originalOwner) {
          console.warn(`⚠️ Shared post ${shared._id} missing "originalOwner" — using tombstone`);
          ownerBlock = tombstone('Deleted User');
        } else {
          const oid = shared.originalOwner._id?.toString?.() || shared.originalOwner.id || 'UNKNOWN_ID';
          const pic = profilePicMap[oid] || {};
          ownerBlock = {
            id: oid,
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
          original: enrichedOriginal.original,
        };
      })
    );

    // (Safety) Final guard in case any slipped through
    const result = enriched
      .filter(Boolean)
      .filter(sp => {
        const sharerId = sp?.user?.id;
        const ownerId = sp?.originalOwner?.id;
        return !(excludeSet.has(String(sharerId)) || excludeSet.has(String(ownerId)));
      });

    return result;
  } catch (err) {
    console.error('❌ Error in getUserAndFollowingSharedPosts resolver:', err);
    throw new Error('Failed to fetch user and following shared posts');
  }
};

module.exports = { getUserAndFollowingSharedPosts };
