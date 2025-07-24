const Business = require('../models/Business');
const { getModelByType } = require('../utils/getModelByType');

async function resolveSharedPostData(postType, originalPostId) {
  const Model = getModelByType(postType);
  const original = await Model.findById(originalPostId);
  if (!original) throw new Error('Original not found');

  let originalOwner, originalOwnerModel;
  if (['review', 'check-in', 'invite'].includes(postType)) {
    originalOwner = original.userId;
    originalOwnerModel = 'User';
  } else {
    const business = await Business.findOne({ placeId: original.placeId });
    if (!business) throw new Error('Business not found');
    originalOwner = business._id;
    originalOwnerModel = 'Business';
  }

  return { original, originalOwner, originalOwnerModel };
}

module.exports = { resolveSharedPostData }