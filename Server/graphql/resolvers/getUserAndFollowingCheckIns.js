const mongoose = require('mongoose');
const User = require('../../models/User');
const { resolveUserProfilePics, gatherUserCheckIns } = require('../../utils/userPosts');

const getUserAndFollowingCheckIns = async (_, { userId }) => {
  try {
    // 🧱 Validate input
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid userId format");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 👥 Fetch following list
    const user = await User.findById(userObjectId).select('following').lean();
    if (!user) throw new Error("User not found");

    const allUserIds = [userObjectId, ...(user.following || [])];

    // 🖼️ Resolve profile pictures
    const profilePicMap = await resolveUserProfilePics(allUserIds);

    // 🧾 Fetch user docs (for full names)
    const userDocs = await User.find({ _id: { $in: allUserIds } })
      .select('_id firstName lastName')
      .lean();

    // 🧠 Build full user objects
    const enrichedUserDocs = userDocs.map(u => ({
      _id: u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      profilePic: profilePicMap[u._id.toString()]?.profilePic || null,
    }));

    // 🚀 Run gatherUserCheckIns for all users
    const enrichedCheckInsNested = await Promise.all(
      enrichedUserDocs.map(user =>
        gatherUserCheckIns(user, profilePicMap[user._id.toString()]?.profilePicUrl || null)
      )
    );

    // 📦 Flatten, sort, return
    const allCheckIns = enrichedCheckInsNested.flat().filter(Boolean);
    return allCheckIns.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error('❌ Error in getUserAndFollowingCheckIns:', error);
    throw new Error("Failed to fetch user and following check-ins");
  }
};

module.exports = {
  getUserAndFollowingCheckIns,
};
