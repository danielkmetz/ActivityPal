const { getPresignedUrl } = require('../cachePresignedUrl');
const User = require('../../models/User');
const Business = require('../../models/Business');

async function enrichOriginalOwner(originalOwner, originalOwnerModel) {
  const originalOwnerId = typeof originalOwner === 'object' ? originalOwner?._id : originalOwner;
  if (!originalOwnerId) return null;

  if (originalOwnerModel === 'User') {
    const ownerUser = await User.findById(originalOwnerId).lean();
    if (!ownerUser) return null;
    return {
      __typename: 'User',
      id: ownerUser._id.toString(),
      firstName: ownerUser.firstName || '',
      lastName: ownerUser.lastName || '',
      profilePicUrl: ownerUser.profilePic?.photoKey ? await getPresignedUrl(ownerUser.profilePic.photoKey) : null,
    };
  }

  if (originalOwnerModel === 'Business') {
    const ownerBiz = await Business.findById(originalOwnerId).lean();
    if (!ownerBiz) return null;
    return {
      __typename: 'Business',
      id: ownerBiz._id.toString(),
      businessName: ownerBiz.businessName || '',
      logoUrl: ownerBiz.logoKey ? await getPresignedUrl(ownerBiz.logoKey) : null,
    };
  }

  return null
}

module.exports = { enrichOriginalOwner } 