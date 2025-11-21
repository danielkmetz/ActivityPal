const mongoose = require('mongoose');
const User = require('../../models/User');
const { Post } = require('../../models/Post');
const { resolveUserProfilePics } = require('../../utils/userPosts');
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse');

const PREVIEW_TOTAL = 2; // how many recent posts to include per suggested user

const getAuthUserId = (ctxUser) =>
  ctxUser?._id?.toString?.() || ctxUser?.id || ctxUser?.userId || null;

const getSuggestedFollows = async (_, { userId }, { user }) => {
  const safeId = String(userId);

  // 1) Load current user and their following list
  const currentUser = await User.findById(userId).select('following').lean();
  if (!currentUser) throw new Error('User not found');

  // 2) Determine viewer (for hidden posts, privacy, etc.)
  const viewerIdStr = getAuthUserId(user) || safeId;
  const viewerObjId = mongoose.Types.ObjectId.isValid(viewerIdStr)
    ? new mongoose.Types.ObjectId(viewerIdStr)
    : null;

  // 3) Build second-degree follow graph (friends-of-friends not already followed)
  const followingRaw = Array.isArray(currentUser.following) ? currentUser.following : [];
  const followingIds = followingRaw.map((v) => v?.toString?.() ?? String(v));
  if (followingIds.length === 0) return [];

  const followedUsers = await User.find({ _id: { $in: followingIds } })
    .select('following')
    .lean();

  const secondDegreeFollows = Object.create(null); // userId -> Set(mutualUserId)
  for (const fu of followedUsers) {
    const list = Array.isArray(fu.following) ? fu.following : [];
    for (const followedId of list) {
      const idStr = followedId?.toString?.() ?? String(followedId);
      if (idStr === safeId) continue; // don't suggest self
      if (followingIds.includes(idStr)) continue; // already following
      if (!secondDegreeFollows[idStr]) secondDegreeFollows[idStr] = new Set();
      secondDegreeFollows[idStr].add(fu._id.toString());
    }
  }

  const suggestionIds = Object.keys(secondDegreeFollows);
  if (suggestionIds.length === 0) return [];

  const [suggestedUsers, mutualUsers] = await Promise.all([
    // ⬇️ include privacySettings so we can expose profileVisibility
    User.find({ _id: { $in: suggestionIds } })
      .select('firstName lastName profilePic privacySettings')
      .lean(),
    User.find({ _id: { $in: followingIds } })
      .select('firstName lastName profilePic privacySettings')
      .lean(),
  ]);

  const mutualMap = new Map(mutualUsers.map((u) => [u._id.toString(), u]));

  // 4) Resolve profile pics for suggested + mutual users
  const allUserIdsNeedingPics = [
    ...suggestedUsers.map((u) => u._id.toString()),
    ...mutualUsers.map((u) => u._id.toString()),
  ];

  let picMap = {};
  try {
    // expected shape: picMap[userId] = { profilePic, profilePicUrl }
    picMap = await resolveUserProfilePics(allUserIdsNeedingPics);
  } catch {
    picMap = {};
  }

  // 5) Pull recent unified Post docs (public, visible) for ALL suggested users
  const suggOwnerOids = suggestionIds
    .filter(mongoose.Types.ObjectId.isValid)
    .map((id) => new mongoose.Types.ObjectId(id));

  const rawPosts = await Post.find({
    ownerId: { $in: suggOwnerOids },
    visibility: 'visible',
    privacy: 'public', // viewer doesn't follow these users yet
    type: { $in: ['review', 'check-in'] },
  })
    .sort({ sortDate: -1, _id: -1 })
    .limit(200)
    .lean();

  // 6) Hydrate + enrich + apply GLOBAL hidden filtering for this viewer
  const hydratedPosts = await hydrateManyPostsForResponse(rawPosts, {
    viewerId: viewerIdStr || null,
  });

  // Group by owner and cap per-user previews
  const postsByOwner = new Map();
  for (const p of hydratedPosts) {
    const ownerId = String(p.ownerId);
    if (!postsByOwner.has(ownerId)) postsByOwner.set(ownerId, []);
    postsByOwner.get(ownerId).push(p);
  }

  for (const [ownerId, arr] of postsByOwner) {
    arr.sort((a, b) => {
      const ad = new Date(a.sortDate).getTime() || 0;
      const bd = new Date(b.sortDate).getTime() || 0;
      if (ad !== bd) return bd - ad;
      return String(b._id).localeCompare(String(a._id));
    });
    postsByOwner.set(ownerId, arr.slice(0, PREVIEW_TOTAL));
  }

  // 7) Assemble final suggested follow objects (including preview posts)
  const result = await Promise.all(
    suggestedUsers.map(async (u) => {
      const userIdStr = u._id.toString();
      const profileVisibility =
        u?.privacySettings?.profileVisibility || 'public';

      const mutualSet = secondDegreeFollows[userIdStr] || new Set();
      const mutualConnections = Array.from(mutualSet)
        .map((mid) => {
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

      const userProfilePic = picMap?.[userIdStr]?.profilePic ?? u.profilePic ?? null;
      const userProfilePicUrl = picMap?.[userIdStr]?.profilePicUrl || null;

      return {
        _id: userIdStr,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`,
        profilePic: userProfilePic,
        profilePicUrl: userProfilePicUrl,

        // 🔐 expose profile visibility explicitly
        profileVisibility, // 'public' | 'private'

        // (optional) nested privacySettings in case the client wants more later
        privacySettings: {
          profileVisibility,
        },

        mutualConnections,
        posts: postsByOwner.get(userIdStr) || [],
      };
    })
  );

  return result;
};

module.exports = { getSuggestedFollows };
