const { getPresignedUrl } = require('./cachePresignedUrl');
const User = require('../models/User');

const enrichStory = async (story, uploaderUser, currentUserId = null, originalOwner = null) => {
  const storyObj = story?.toObject ? story.toObject() : story;
  const rawUploader = uploaderUser?.toObject ? uploaderUser.toObject() : uploaderUser;

  // --- media
  const mediaUrl = storyObj.mediaKey ? await getPresignedUrl(storyObj.mediaKey) : null;

  // --- uploader (shape as OriginalOwner union)
  const uploaderIsBusiness = !!(rawUploader?.businessName || rawUploader?.placeId);
  const uploaderId = rawUploader?._id?.toString?.() || rawUploader?.id || null;

  const uploaderProfilePicUrl = rawUploader?.profilePic?.photoKey
    ? await getPresignedUrl(rawUploader.profilePic.photoKey)
    : null;

  const uploaderLogoUrl = rawUploader?.logoKey
    ? await getPresignedUrl(rawUploader.logoKey)
    : null;

  const uploader = uploaderIsBusiness
    ? {
        __typename: 'Business',
        id: uploaderId,
        businessName: rawUploader?.businessName || null,
        placeId: rawUploader?.placeId || null,
        logoUrl: uploaderLogoUrl,
      }
    : {
        __typename: 'User',
        id: uploaderId,
        firstName: rawUploader?.firstName || null,
        lastName: rawUploader?.lastName || null,
        profilePicUrl: uploaderProfilePicUrl,
      };

  // --- viewedBy
  let viewedBy = [];
  if (Array.isArray(storyObj.viewedBy) && storyObj.viewedBy.length > 0) {
    const viewerUsers = await User.find({ _id: { $in: storyObj.viewedBy } })
      .select('_id firstName lastName profilePic')
      .lean();

    viewedBy = await Promise.all(
      viewerUsers.map(async (viewer) => {
        const viewerPicUrl = viewer?.profilePic?.photoKey
          ? await getPresignedUrl(viewer.profilePic.photoKey)
          : null;

        return {
          __typename: 'User',
          id: viewer._id.toString(),
          firstName: viewer.firstName || null,
          lastName: viewer.lastName || null,
          profilePicUrl: viewerPicUrl,
        };
      })
    );
  }

  const isViewed = !!(
    currentUserId &&
    Array.isArray(storyObj.viewedBy) &&
    storyObj.viewedBy.some((id) => id?.toString?.() === currentUserId?.toString?.())
  );

  let typedOriginalOwner = null;

  const storyReferencesOriginalOwner =
    !!(storyObj?.originalOwner || storyObj?.originalOwnerModel);

  if (storyReferencesOriginalOwner) {
    if (originalOwner && typeof originalOwner === 'object') {
      const isBiz = !!originalOwner.businessName;
      const ownerId = originalOwner._id?.toString?.() || originalOwner.id;

      if (isBiz) {
        typedOriginalOwner = {
          __typename: 'Business',
          id: ownerId,
          businessName: originalOwner.businessName || null,
          logoUrl: originalOwner.logoKey ? await getPresignedUrl(originalOwner.logoKey) : (originalOwner.logoUrl || null),
        };
      } else {
        typedOriginalOwner = {
          __typename: 'User',
          id: ownerId,
          firstName: originalOwner.firstName || null,
          lastName: originalOwner.lastName || null,
          profilePicUrl:
            originalOwner.profilePicUrl ||
            (originalOwner.profilePic?.photoKey
              ? await getPresignedUrl(originalOwner.profilePic.photoKey)
              : null),
        };
      }

      if (!typedOriginalOwner?.id) {
        console.error(`❌ [enrichStory] Missing required "id" for story ${storyObj._id} originalOwner:`, originalOwner);
      }
      if (!typedOriginalOwner?.__typename) {
        console.error(`❌ [enrichStory] Missing __typename for story ${storyObj._id} originalOwner:`, originalOwner);
      }
    } else {
      // We expected an owner but didn't get an object (could be null or an ObjectId string) – warn once, quietly.
      console.warn('⚠️ [enrichStory] story references originalOwner, but helper received none or non-object:', {
        storyId: storyObj?._id,
        originalOwnerReceived: originalOwner,
      });
    }
  }
  
  const enriched = {
    ...storyObj,
    mediaUrl,
    viewedBy,
    isViewed,
    user: uploader,            // GraphQL: Story.user is OriginalOwner union
    _originalOwner: typedOriginalOwner, // internal convenience (ignored by GraphQL selection)
  };

  return enriched;
};

module.exports = { enrichStory };
