const User = require('../../models/User');
const { resolveUserProfilePics, gatherUserReviews, gatherUserCheckIns } = require('../../utils/userPosts');

const getSuggestedFollows = async (_, { userId }, { user }) => {
  const safeId = String(userId);

  let currentUser;
  try {
    currentUser = await User.findById(userId).select('following').lean();
  } catch (err) {
    throw err;
  }

  if (!currentUser) {
    throw new Error('User not found');
  }

  const followingRaw = Array.isArray(currentUser.following) ? currentUser.following : [];
  const followingIds = followingRaw.map(v => v?.toString?.() ?? String(v));

  if (followingIds.length === 0) {
    return [];
  }

  const followedUsers = await User.find({ _id: { $in: followingIds } })
    .select('following')
    .lean();

  const secondDegreeFollows = Object.create(null);

  for (const fu of followedUsers) {
    const list = Array.isArray(fu.following) ? fu.following : [];
    for (const followedId of list) {
      const idStr = followedId?.toString?.() ?? String(followedId);
      if (idStr === safeId) continue;
      if (followingIds.includes(idStr)) continue;
      if (!secondDegreeFollows[idStr]) secondDegreeFollows[idStr] = new Set();
      secondDegreeFollows[idStr].add(fu._id.toString());
    }
  }

  const suggestionIds = Object.keys(secondDegreeFollows);
  if (suggestionIds.length === 0) {
    return [];
  }

  const [suggestedUsers, mutualUsers] = await Promise.all([
    User.find({ _id: { $in: suggestionIds } }).lean(),
    User.find({ _id: { $in: followingIds } }).lean(),
  ]);

  const mutualMap = new Map(mutualUsers.map(u => [u._id.toString(), u]));

  const allUserIdsNeedingPics = [
    ...suggestedUsers.map(u => u._id.toString()),
    ...mutualUsers.map(u => u._id.toString()),
  ];

  let picMap = {};
  try {
    picMap = await resolveUserProfilePics(allUserIdsNeedingPics);
  } catch {
    picMap = {};
  }

  const enriched = await Promise.all(
    suggestedUsers.map(async (u) => {
      const userIdStr = u._id.toString();
      const mutualSet = secondDegreeFollows[userIdStr] || new Set();
      const mutualConnections = Array.from(mutualSet)
        .map(mid => {
          const mu = mutualMap.get(mid);
          return mu
            ? {
                _id: mu._id,
                firstName: mu.firstName,
                lastName: mu.lastName,
                profilePic: mu.profilePic || null,
                profilePicUrl: picMap?.[mid]?.profilePicUrl || null,
              }
            : null;
        })
        .filter(Boolean);

      const userProfilePic = picMap?.[userIdStr]?.profilePic ?? (u.profilePic || null);
      const userProfilePicUrl = picMap?.[userIdStr]?.profilePicUrl || null;

      let reviews = [];
      let checkIns = [];

      try {
        [reviews, checkIns] = await Promise.all([
          gatherUserReviews(u._id, userProfilePic, userProfilePicUrl),
          gatherUserCheckIns(u, userProfilePicUrl),
        ]);
      } catch {
        // Swallow gather errors to avoid breaking suggestions
      }

      return {
        _id: userIdStr,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`,
        profilePic: userProfilePic,
        profilePicUrl: userProfilePicUrl,
        mutualConnections,
        profileVisibility: u?.privacySettings?.profileVisibility || 'public',
        reviews,
        checkIns,
      };
    })
  );

  return enriched;
};

module.exports = { getSuggestedFollows };
