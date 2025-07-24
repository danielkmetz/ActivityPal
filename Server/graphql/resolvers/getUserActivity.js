const mongoose = require('mongoose');
const { getUserAndFollowingReviews } = require('./getUserAndFollowingReviews');
const { getUserAndFollowingCheckIns } = require('./getUserAndFollowingCheckIns');
const { getUserAndFollowingInvites } = require('./getUserAndFollowingInvites');
const { getUserAndFollowingSharedPosts } = require('./userAndFollowingSharedPosts')

const getUserActivity = async (_, { userId, limit = 15, after, userLat, userLng }, { dataSources }) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid userId format");
    };

    const reviews = await getUserAndFollowingReviews(_, { userId }, { dataSources }) || [];
    const checkIns = await getUserAndFollowingCheckIns(_, { userId }, { dataSources }) || [];
    const inviteData = await getUserAndFollowingInvites(_, { userId }, { dataSources }) || {};
    const sharedPosts = await getUserAndFollowingSharedPosts(_, { userId, userLat, userLng }, { dataSources }) || [];

    const invites = [
      ...(inviteData.userInvites || []),
      ...(inviteData.friendPublicInvites || [])
    ];

    const normalizeDate = (item) => {
      const rawDate = item.date || item.createdAt || item.timestamp || item.dateTime || 0;
      const parsedDate = new Date(rawDate);
      return {
        ...item,
        sortDate: parsedDate.toISOString(),
      };
    };

    const posts = [
      ...reviews.map(r => normalizeDate({ ...r, type: 'review' })),
      ...checkIns.map(c => normalizeDate({ ...c, type: 'check-in' })),
      ...invites.map(i => normalizeDate({ ...i, type: 'invite' })),
      ...sharedPosts.map(s => normalizeDate({ ...s, type: 'sharedPost' })),
    ];

    let filtered = posts.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

    if (after?.sortDate && after?.id) {
      const afterTime = new Date(after.sortDate).getTime();
      filtered = filtered.filter(p => {
        const currentTime = new Date(p.sortDate).getTime();
        return currentTime < afterTime || (currentTime === afterTime && p._id < after.id);
      });
    }

    return filtered.slice(0, limit);
  } catch (error) {
    throw new Error("Failed to fetch user activity");
  }
};

module.exports = {
  getUserActivity,
};