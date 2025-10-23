const mongoose = require('mongoose');
const User = require('../../models/User');
const { resolveUserProfilePics, gatherUserCheckIns } = require('../../utils/userPosts');

const getUserAndFollowingCheckIns = async (_, { userId, excludeAuthorIds = [] }, ctx) => {
  try {
    // 🔎 Validate
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 👥 Fetch following list (ids only)
    const user = await User.findById(userObjectId).select('following').lean();
    if (!user) throw new Error('User not found');

    // Normalize following → string ids
    const followingRaw = Array.isArray(user.following) ? user.following : [];
    const followingStr = followingRaw
      .map((f) => (f && typeof f === 'object' ? (f._id || f.id || f) : f))
      .filter(Boolean)
      .map(String);

    // Candidates (me + following), as strings
    const candidateIdsStr = [String(userObjectId), ...followingStr];

    // 🚫 Push-down block filter (remove anyone I block or who blocks me)
    const excludeSet = new Set(excludeAuthorIds.map(String));
    const allowedIdsStrUnique = Array.from(
      new Set(candidateIdsStr.filter((id) => !excludeSet.has(id)))
    );

    // Nothing left? Return early.
    if (allowedIdsStrUnique.length === 0) return [];

    // Back to ObjectIds for queries/utilities
    const allowedIds = allowedIdsStrUnique.map((id) => new mongoose.Types.ObjectId(id));

    // 🖼️ Resolve profile pics only for allowed authors
    const profilePicMap = await resolveUserProfilePics(allowedIds);

    // 👤 Fetch allowed user docs (names, etc.)
    const userDocs = await User.find({ _id: { $in: allowedIds } })
      .select('_id firstName lastName')
      .lean();

    // Compose enriched user objects with pic info
    const enrichedUserDocs = userDocs.map((u) => {
      const meta = profilePicMap[String(u._id)] || {};
      return {
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        profilePic: meta.profilePic ?? null,
        profilePicUrl: meta.profilePicUrl ?? null,
      };
    });

    if (typeof gatherUserCheckIns !== 'function') return [];

    // 📥 Gather check-ins only for allowed authors
    const enrichedCheckInsNested = await Promise.all(
      enrichedUserDocs.map(async (u) => {
        try {
          const res = await gatherUserCheckIns(u, u.profilePicUrl || u.profilePic || null);
          return Array.isArray(res) ? res : [];
        } catch {
          return [];
        }
      })
    );

    // 📦 Flatten, sort, return
    const allCheckIns = enrichedCheckInsNested.flat().filter(Boolean);

    return allCheckIns.sort(
      (a, b) =>
        new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)
    );
  } catch {
    throw new Error('Failed to fetch user and following check-ins');
  }
};

module.exports = { getUserAndFollowingCheckIns };
