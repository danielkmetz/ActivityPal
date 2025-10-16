const HiddenTag = require('../models/HiddenTag');

async function getHiddenIdsForUser(userId) {
  const rows = await HiddenTag.find({ userId }).lean();
  const hiddenReviewIds  = [];
  const hiddenCheckInIds = [];
  for (const r of rows) {
    if (r.targetRef === 'Review')  hiddenReviewIds.push(r.targetId);
    if (r.targetRef === 'CheckIn') hiddenCheckInIds.push(r.targetId);
  }
  return { hiddenReviewIds, hiddenCheckInIds };
}

module.exports = { getHiddenIdsForUser };
