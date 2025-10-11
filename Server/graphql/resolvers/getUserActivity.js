const mongoose = require('mongoose');
const { GraphQLError } = require('graphql');
const { getUserAndFollowingReviews } = require('./getUserAndFollowingReviews');
const { getUserAndFollowingCheckIns } = require('./getUserAndFollowingCheckIns');
const { getUserAndFollowingInvites } = require('./getUserAndFollowingInvites');
const { getUserAndFollowingSharedPosts } = require('./userAndFollowingSharedPosts');
const { getPostedLiveStreams } = require('./getPostedLiveStreams');

const getAuthUserId = (ctx) =>
  ctx?.user?._id?.toString?.() || ctx?.user?.id || ctx?.user?.userId || null;

const getUserActivity = async (
  _,
  // remove userId from args; keep others
  { limit = 15, after, userLat, userLng },
  context
) => {
  try {
    const authUserId = getAuthUserId(context);
    if (!authUserId) {
      throw new GraphQLError('Not authenticated', {
        extensions: { code: 'UNAUTHENTICATED' },
      });
    }

    if (!mongoose.Types.ObjectId.isValid(authUserId)) {
      throw new GraphQLError('Invalid user id', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const reviews =
      (await getUserAndFollowingReviews(_, { userId: authUserId }, context)) || [];
    const checkIns =
      (await getUserAndFollowingCheckIns(_, { userId: authUserId }, context)) || [];
    const inviteData =
      (await getUserAndFollowingInvites(_, { userId: authUserId }, context)) || {};
    const sharedPosts =
      (await getUserAndFollowingSharedPosts(
        _,
        { userId: authUserId, userLat, userLng },
        context
      )) || [];
    const liveStreams =
      (await getPostedLiveStreams(_, { userId: authUserId }, context)) || [];

    const invites = [
      ...(inviteData.userInvites || []),
      ...(inviteData.friendPublicInvites || []),
    ];

    const normalizeDate = (item) => {
      const rawDate = item.date || item.createdAt || item.timestamp || item.dateTime || 0;
      const parsedDate = new Date(rawDate);
      return { ...item, sortDate: parsedDate.toISOString() };
    };

    const posts = [
      ...reviews.map((r) => normalizeDate({ ...r, type: 'review' })),
      ...checkIns.map((c) => normalizeDate({ ...c, type: 'check-in' })),
      ...invites.map((i) => normalizeDate({ ...i, type: 'invite' })),
      ...sharedPosts.map((s) => normalizeDate({ ...s, type: 'sharedPost' })),
      ...liveStreams.map((s) => normalizeDate({ ...s, type: 'liveStream' })),
    ];

    let filtered = posts.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

    if (after?.sortDate && after?.id) {
      const afterTime = new Date(after.sortDate).getTime();
      filtered = filtered.filter((p) => {
        const currentTime = new Date(p.sortDate).getTime();
        return currentTime < afterTime || (currentTime === afterTime && p._id < after.id);
      });
    }

    return filtered.slice(0, limit);
  } catch (error) {
    // keep the original generic error shape if you prefer
    throw new Error('Failed to fetch user activity');
  }
};

module.exports = {
  getUserActivity,
};