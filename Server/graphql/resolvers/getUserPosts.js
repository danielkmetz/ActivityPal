const mongoose = require('mongoose');
const User = require('../../models/User');
const SharedPost = require('../../models/SharedPost');
const HiddenPost = require('../../models/HiddenPosts');
const { getPresignedUrl } = require('../../utils/cachePresignedUrl');
const {
  gatherUserReviews,
  gatherUserCheckIns,
  resolveUserProfilePics,
  enrichSharedPost
} = require('../../utils/userPosts');

const getAuthUserId = (ctx) =>
  ctx?.user?._id?.toString?.() || ctx?.user?.id || ctx?.user?.userId || null;

const getUserPosts = async (_, { userId, limit = 15, after }, context) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 👇 Determine viewer (who may have hidden posts)
    const viewerId = getAuthUserId(context);
    const viewerObjectId = viewerId && mongoose.Types.ObjectId.isValid(viewerId)
      ? new mongoose.Types.ObjectId(viewerId)
      : null;

    // 👇 Build hidden ID sets per model for the viewer
    let hiddenByRef = { Review: new Set(), CheckIn: new Set(), SharedPost: new Set() };
    if (viewerObjectId) {
      try {
        const rows = await HiddenPost.find(
          { userId: viewerObjectId },
          { targetRef: 1, targetId: 1, _id: 0 }
        ).lean();

        hiddenByRef = rows.reduce((acc, r) => {
          const ref = r?.targetRef;
          if (!ref) return acc;
          if (!acc[ref]) acc[ref] = new Set();
          acc[ref].add(String(r.targetId));
          return acc;
        }, { Review: new Set(), CheckIn: new Set(), SharedPost: new Set() });
      } catch (e) {
        console.warn('[getUserPosts] hidden fetch failed:', e?.message);
      }
    }

    const user = await User.findById(userObjectId).select(
      '_id profilePic firstName lastName'
    );
    if (!user) throw new Error('User not found');

    const photoKey = user.profilePic?.photoKey || null;
    const profilePicUrl = photoKey ? await getPresignedUrl(photoKey) : null;

    // Fetch all content
    const reviewsRaw = await gatherUserReviews(userObjectId, user.profilePic, profilePicUrl);
    const checkInsRaw = await gatherUserCheckIns(user, profilePicUrl);

    const sharedPostsRaw = await SharedPost.find({ user: userObjectId })
      .sort({ createdAt: -1 })
      .lean();

    // 🔒 Filter each list by the viewer's hidden sets (DB-model refs)
    const reviews = (reviewsRaw || []).filter(r =>
      !hiddenByRef.Review?.has(String(r._id || r.id))
    );
    const checkIns = (checkInsRaw || []).filter(c =>
      !hiddenByRef.CheckIn?.has(String(c._id || c.id))
    );
    const sharedPostsSource = (sharedPostsRaw || []).filter(sp =>
      !hiddenByRef.SharedPost?.has(String(sp._id || sp.id))
    );

    const profilePicMap = await resolveUserProfilePics([
      user._id.toString(),
      ...sharedPostsSource.map(sp => sp.originalOwner?.toString()).filter(Boolean),
    ]);

    const enrichedSharedPosts = await Promise.all(
      sharedPostsSource.map(async (shared) => {
        const enrichedOriginal = await enrichSharedPost(shared, profilePicMap);
        if (!enrichedOriginal) return null;

        return {
          _id: shared._id,
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePic: user.profilePic,
            profilePicUrl,
          },
          originalOwner: {
            id: shared.originalOwner,
            ...profilePicMap[shared.originalOwner?.toString()],
          },
          postType: shared.postType,
          originalPostId: shared.originalPostId,
          caption: shared.caption,
          createdAt: shared.createdAt,
          original: enrichedOriginal.original,
          comments: shared.comments || [],
          type: 'sharedPost',
          sortDate: shared.createdAt,
        };
      })
    );

    const sharedPosts = enrichedSharedPosts.filter(Boolean);

    // Ensure type is set on reviews/check-ins so downstream code is consistent
    const allPosts = [
      ...reviews.map(post => ({ ...post, type: 'review',    sortDate: post.date })),
      ...checkIns.map(post => ({ ...post, type: 'check-in', sortDate: post.date })),
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
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = {
  getUserPosts,
};
