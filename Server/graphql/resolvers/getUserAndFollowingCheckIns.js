const mongoose = require('mongoose');
const User = require('../../models/User');
const { resolveUserProfilePics, gatherUserCheckIns } = require('../../utils/userPosts');

const getUserAndFollowingCheckIns = async (_, { userId }) => {
  try {
    // 🧱 Validate input
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 👥 Fetch following list
    const user = await User.findById(userObjectId).select('following').lean();
    if (!user) {
      throw new Error('User not found');
    }

    // Normalize following → ObjectId[]
    const followingRaw = Array.isArray(user.following) ? user.following : [];
    const followingNormalized = followingRaw
      .map((f) => (f && typeof f === 'object' ? (f._id || f.id || f) : f))
      .filter(Boolean)
      .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id));

    const allUserIds = [userObjectId, ...followingNormalized];

    // 🖼️ Resolve profile pictures
    const profilePicMap = await resolveUserProfilePics(allUserIds);

    // 🧾 Fetch user docs (for names)
    const userDocs = await User.find({ _id: { $in: allUserIds } })
      .select('_id firstName lastName')
      .lean();

    // 🧠 Build full user objects (store BOTH keys to catch mismatches)
    const enrichedUserDocs = userDocs.map((u) => {
      const pic = profilePicMap[u._id.toString()] || {};
      return {
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        profilePic: pic.profilePic ?? null,        // if your resolver returns this
        profilePicUrl: pic.profilePicUrl ?? null,  // if your resolver returns this
      };
    });

    if (typeof gatherUserCheckIns !== 'function') {
      return [];
    }

    // 🚀 Run gatherUserCheckIns for all users
    const enrichedCheckInsNested = await Promise.all(
      enrichedUserDocs.map(async (u) => {
        try {
          const result = await gatherUserCheckIns(u, u.profilePicUrl || u.profilePic || null);
          return Array.isArray(result) ? result : [];
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

module.exports = {
  getUserAndFollowingCheckIns,
};
