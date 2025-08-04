const { getPresignedUrl } = require('./cachePresignedUrl');
const User = require('../models/User');

const enrichStory = async (story, uploaderUser, currentUserId = null, originalOwner = null) => {
  const storyObj = story.toObject ? story.toObject() : story;

  const mediaUrl = storyObj.mediaKey ? await getPresignedUrl(storyObj.mediaKey) : null;

  const profilePicUrl = uploaderUser?.profilePic?.photoKey
    ? await getPresignedUrl(uploaderUser.profilePic.photoKey)
    : null;

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
          id: viewer._id.toString(),
          firstName: viewer.firstName,
          lastName: viewer.lastName,
          profilePicUrl: viewerPicUrl,
          __typename: 'User',
        };
      })
    );
  }

  const isViewed = currentUserId
    ? storyObj.viewedBy?.some((id) => id.toString() === currentUserId.toString())
    : false;

  let typedOriginalOwner = originalOwner;
  if (
    originalOwner &&
    typeof originalOwner === 'object' &&
    !originalOwner.__typename
  ) {
    const isBusiness = !!originalOwner.businessName;
    typedOriginalOwner = {
      ...originalOwner,
      id: originalOwner._id?.toString?.() || originalOwner.id || 'MISSING_ID',
      __typename: isBusiness ? 'Business' : 'User',
    };
  }

 // 🚨 Validate fields
  if (!typedOriginalOwner?.id) {
    console.error(
      `❌ [enrichStory] Missing required "id" for story ${storyObj._id} user:`,
      typedOriginalOwner
    );
  }

  if (!typedOriginalOwner?.__typename) {
    console.error(
      `❌ [enrichStory] Missing __typename for story ${storyObj._id} user:`,
      typedOriginalOwner
    );
  }

  if (
    !typedOriginalOwner ||
    typeof typedOriginalOwner === 'string' ||
    typedOriginalOwner._bsontype === 'ObjectId'
  ) {
    console.warn('❌ [enrichStory] originalOwner not valid object:', story._id, originalOwner);
  }

  const enriched = {
    ...storyObj,
    mediaUrl,
    profilePicUrl,
    viewedBy,
    isViewed,
    user: typedOriginalOwner,
  };

  return enriched;
};

module.exports = { enrichStory };
