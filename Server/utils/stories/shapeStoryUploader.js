const mongoose = require('mongoose');
const User = require('../../models/User');
const { getPresignedUrl } = require('../cachePresignedUrl');

async function shapeStoryUploader(user, profilePicMap = {}) {
  // resolve id
  let id = user;
  if (typeof user === 'object' && user) id = user._id || user.id;
  id = id?.toString ? id.toString() : id;

  // hydrate if needed
  let doc = typeof user === 'object' && user ? user : null;
  if (!doc && id && mongoose.Types.ObjectId.isValid(id)) {
    doc = await User.findById(id)
      .select('firstName lastName profilePic businessName placeId logoKey accountType __t')
      .lean();
  }

  // If nothing found, return minimal user with fallback pic (map)
  if (!doc) {
    return {
      __typename: 'User',
      id,
      firstName: '',
      lastName: '',
      profilePicUrl: (id && profilePicMap[id]?.profilePicUrl) || null,
    };
  }

  // Prefer "User" if there are user-ish fields present
  const looksLikeUser = !!(doc.firstName || doc.lastName);

  // If you use discriminators or a role flag, check those first:
  const isBusinessDiscriminator = doc.__t === 'Business' || doc.accountType === 'business';

  // Only treat as Business if it's clearly a business *and* not a person
  if (!looksLikeUser && (isBusinessDiscriminator || doc.businessName || doc.placeId)) {
    return {
      __typename: 'Business',
      id,
      businessName: doc.businessName || '',
      logoUrl: doc.logoKey ? await getPresignedUrl(doc.logoKey) : null,
    };
  }

  // User branch
  let profilePicUrl = null;
  if (doc.profilePic?.photoKey) {
    profilePicUrl = await getPresignedUrl(doc.profilePic.photoKey);
  } else if (id && profilePicMap[id]?.profilePicUrl) {
    profilePicUrl = profilePicMap[id].profilePicUrl;
  }

  return {
    __typename: 'User',
    id,
    firstName: doc.firstName || '',
    lastName: doc.lastName || '',
    profilePicUrl,
  };
}

module.exports = { shapeStoryUploader };
