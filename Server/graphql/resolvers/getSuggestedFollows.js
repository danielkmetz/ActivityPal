const User = require('../../models/User');
const { resolveUserProfilePics, gatherUserReviews, gatherUserCheckIns } = require('../../utils/userPosts');

const getSuggestedFollows = async (_, { userId }, { user }) => {
  const currentUser = await User.findById(userId).select('following');
  if (!currentUser) {
    throw new Error('User not found');
  }

  const followingIds = currentUser.following.map(id => id.toString());

  // Step 1: Find second-degree connections and mutuals
  const followedUsers = await User.find({ _id: { $in: followingIds } }).select('following');

  const secondDegreeFollows = {};

  followedUsers.forEach(fu => {
    if (!fu.following) return;
    fu.following.forEach(followedId => {
      const idStr = followedId.toString();
      if (idStr !== userId && !followingIds.includes(idStr)) {
        if (!secondDegreeFollows[idStr]) secondDegreeFollows[idStr] = new Set();
        secondDegreeFollows[idStr].add(fu._id.toString());
      }
    });
  });

  const suggestionIds = Object.keys(secondDegreeFollows);

  if (suggestionIds.length === 0) {
    return [];
  }

  // Step 2: Get suggested users and mutuals
  const [suggestedUsers, mutualUsers] = await Promise.all([
    User.find({ _id: { $in: suggestionIds } }).lean(),
    User.find({ _id: { $in: followingIds } }).lean()
  ]);

  const mutualMap = new Map(mutualUsers.map(u => [u._id.toString(), u]));

  // Step 3: Resolve profile pics
  const allUserIdsNeedingPics = [
    ...suggestedUsers.map(u => u._id.toString()),
    ...mutualUsers.map(u => u._id.toString())
  ];
  const picMap = await resolveUserProfilePics(allUserIdsNeedingPics);

  // Step 4: Enrich suggestions
  const enriched = await Promise.all(
    suggestedUsers.map(async u => {
      const userIdStr = u._id.toString();
      const mutualConnections = Array.from(secondDegreeFollows[userIdStr] || []).map(mid => {
        const mu = mutualMap.get(mid);
        return mu ? {
          _id: mu._id,
          firstName: mu.firstName,
          lastName: mu.lastName,
          profilePic: mu.profilePic || null,
          profilePicUrl: picMap[mid]?.profilePicUrl || null,
        } : null;
      }).filter(Boolean);

      const userProfilePic = picMap[userIdStr]?.profilePic || null;
      const userProfilePicUrl = picMap[userIdStr]?.profilePicUrl || null;

      let reviews = [];
      let checkIns = [];

      try {
        [reviews, checkIns] = await Promise.all([
          gatherUserReviews(u._id, userProfilePic, userProfilePicUrl),
          gatherUserCheckIns(u, userProfilePicUrl)
        ]);
      } catch (err) {
        console.error(`❗ Failed to gather posts for user ${userIdStr}:`, err.message);
      }

      return {
        _id: userIdStr,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`,
        profilePic: userProfilePic,
        profilePicUrl: userProfilePicUrl,
        mutualConnections,
        profileVisibility: u.privacySettings?.profileVisibility || 'public',
        reviews,
        checkIns,
      };
    })
  );

  return enriched;
};

module.exports = { getSuggestedFollows };
