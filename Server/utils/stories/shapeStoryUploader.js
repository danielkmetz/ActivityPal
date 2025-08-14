const { getPresignedUrl } = require('../cachePresignedUrl');

async function shapeStoryUploader(user) {
  // You already had this logic — reproduced here for completeness
  const isBusiness = user?.businessName || user?.placeId;
  if (isBusiness) {
    return {
      __typename: 'Business',
      id: user._id?.toString?.() || user.id,
      businessName: user.businessName || '',
      logoUrl: user.logoKey ? await getPresignedUrl(user.logoKey) : null,
    };
  }
  return {
    __typename: 'User',
    id: user._id?.toString?.() || user.id,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    profilePicUrl: user.profilePic?.photoKey ? await getPresignedUrl(user.profilePic.photoKey) : null,
  };
}

module.exports = { shapeStoryUploader }