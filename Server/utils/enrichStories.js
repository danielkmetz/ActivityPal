const { getPresignedUrl } = require('./cachePresignedUrl');
const User = require('../models/User');

const enrichStory = async (story, user, currentUserId = null) => {
  const storyObj = story.toObject();

  // Enrich media URL
  const mediaUrl = await getPresignedUrl(storyObj.mediaKey);

  // Enrich uploader's profile picture
  const profilePicUrl = user.profilePic?.photoKey
    ? await getPresignedUrl(user.profilePic.photoKey)
    : null;

  // Enrich viewedBy user info
  let viewedBy = [];
  if (Array.isArray(storyObj.viewedBy) && storyObj.viewedBy.length > 0) {
    const viewerUsers = await User.find({ _id: { $in: storyObj.viewedBy } })
      .select('_id firstName lastName profilePic')
      .lean();

    viewedBy = await Promise.all(
      viewerUsers.map(async (viewer) => {
        const viewerPicUrl = viewer.profilePic?.photoKey
          ? await getPresignedUrl(viewer.profilePic.photoKey)
          : null;

        return {
          _id: viewer._id,
          firstName: viewer.firstName,
          lastName: viewer.lastName,
          profilePicUrl: viewerPicUrl,
        };
      })
    );
  }

   const isViewed = currentUserId
    ? storyObj.viewedBy?.some(id => id.toString() === currentUserId.toString())
    : false;

  return {
    ...storyObj,
    mediaUrl,
    profilePicUrl,
    viewedBy, // enriched viewer data
    isViewed,
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  };
};

module.exports = { enrichStory };
