const mongoose = require('mongoose');
const User = require('../../models/User');
const HiddenPost = require('../../models/HiddenPosts');
const { Post } = require('../../models/Post');
const { resolveUserProfilePics } = require('../../utils/userPosts');
const {
  fetchUserSummaries,
  collectUserIdsFromPosts,
  enrichPostUniversal,
} = require('../../utils/enrichPosts');

const PREVIEW_TOTAL = 2; // how many recent posts to include per suggested user

const getAuthUserId = (ctxUser) =>
  ctxUser?._id?.toString?.() || ctxUser?.id || ctxUser?.userId || null;

const getSuggestedFollows = async (_, { userId }, { user }) => {
  const safeId = String(userId);

  // 1) Load current user and their following list
  const currentUser = await User.findById(userId).select('following').lean();
  if (!currentUser) throw new Error('User not found');

  // 2) Build hidden sets for the viewer (supports new Post + legacy Review/CheckIn)
  const viewerId = getAuthUserId(user) || safeId;
  const viewerObjId = mongoose.Types.ObjectId.isValid(viewerId)
    ? new mongoose.Types.ObjectId(viewerId)
    : null;

  const hiddenPostIds = new Set();
  const hiddenReviewIds = new Set();   // legacy
  const hiddenCheckInIds = new Set();  // legacy

  if (viewerObjId) {
    try {
      const rows = await HiddenPost.find(
        { userId: viewerObjId },
        { targetRef: 1, targetId: 1, _id: 0 }
      ).lean();

      for (const r of rows || []) {
        const id = String(r.targetId);
        const ref = String(r.targetRef || '');
        if (!id) continue;
        if (ref === 'Post') hiddenPostIds.add(id);
        if (ref === 'Review') hiddenReviewIds.add(id);
        if (ref === 'CheckIn') hiddenCheckInIds.add(id);
      }
    } catch (e) {
      console.warn('[getSuggestedFollows] hidden fetch failed:', e?.message);
    }
  }

  // 3) Build second-degree follow graph (friends-of-friends not already followed)
  const followingRaw = Array.isArray(currentUser.following) ? currentUser.following : [];
  const followingIds = followingRaw.map(v => v?.toString?.() ?? String(v));
  if (followingIds.length === 0) return [];

  const followedUsers = await User.find({ _id: { $in: followingIds } })
    .select('following')
    .lean();

  const secondDegreeFollows = Object.create(null); // userId -> Set(mutualUserId)
  for (const fu of followedUsers) {
    const list = Array.isArray(fu.following) ? fu.following : [];
    for (const followedId of list) {
      const idStr = followedId?.toString?.() ?? String(followedId);
      if (idStr === safeId) continue;                 // don't suggest self
      if (followingIds.includes(idStr)) continue;     // already following
      if (!secondDegreeFollows[idStr]) secondDegreeFollows[idStr] = new Set();
      secondDegreeFollows[idStr].add(fu._id.toString());
    }
  }

  const suggestionIds = Object.keys(secondDegreeFollows);
  if (suggestionIds.length === 0) return [];

  const [suggestedUsers, mutualUsers] = await Promise.all([
    User.find({ _id: { $in: suggestionIds } }).lean(),
    User.find({ _id: { $in: followingIds } }).lean(),
  ]);
  const mutualMap = new Map(mutualUsers.map(u => [u._id.toString(), u]));

  // 4) Resolve profile pics for suggested + mutual users
  const allUserIdsNeedingPics = [
    ...suggestedUsers.map(u => u._id.toString()),
    ...mutualUsers.map(u => u._id.toString()),
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
    .map(id => new mongoose.Types.ObjectId(id));

  const rawPosts = await Post.find({
      ownerId: { $in: suggOwnerOids },
      visibility: 'visible',
      privacy: 'public',                 // viewer doesn't follow yet
      type: { $in: ['review', 'check-in'] },
    })
    .sort({ sortDate: -1, _id: -1 })
    .limit(200)
    .lean();

  // Filter out hidden (new Post + legacy)
  const visiblePosts = rawPosts.filter(p => {
    const id = String(p._id);
    if (hiddenPostIds.has(id)) return false;
    if (p.type === 'review'   && hiddenReviewIds.has(id)) return false;
    if (p.type === 'check-in' && hiddenCheckInIds.has(id)) return false;
    return true;
  });

  // 6) Enrich posts (owner, tags, media URLs, likes/comments, etc.)
  const neededUserIds = collectUserIdsFromPosts(visiblePosts);
  const userMap = await fetchUserSummaries(neededUserIds);
  const enrichedPosts = await Promise.all(visiblePosts.map(p => enrichPostUniversal(p, userMap)));

  // Group by owner and cap per-user previews
  const postsByOwner = new Map();
  for (const p of enrichedPosts) {
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

  // 7) Assemble final suggested follow objects (unified posts list)
  const result = await Promise.all(
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
                lastName:  mu.lastName,
                profilePic: mu.profilePic || null,
                profilePicUrl: picMap?.[mid]?.profilePicUrl || null,
              }
            : null;
        })
        .filter(Boolean);

      const userProfilePic     = picMap?.[userIdStr]?.profilePic ?? (u.profilePic || null);
      const userProfilePicUrl  = picMap?.[userIdStr]?.profilePicUrl || null;

      return {
        _id: userIdStr,
        firstName: u.firstName,
        lastName:  u.lastName,
        fullName: `${u.firstName} ${u.lastName}`,
        profilePic: userProfilePic,
        profilePicUrl: userProfilePicUrl,
        profileVisibility: u?.privacySettings?.profileVisibility || 'public',
        mutualConnections,
        posts: postsByOwner.get(userIdStr) || [],
      };
    })
  );

  return result;
};

module.exports = { getSuggestedFollows }