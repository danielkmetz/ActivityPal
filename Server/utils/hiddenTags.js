const HiddenTag = require('../models/HiddenTag');

async function getHiddenIdsForUser(userId) {
  const rows = await HiddenTag.find(
    { userId },
    { targetId: 1, _id: 0 }
  ).lean();

  // Just return the IDs as-is (ObjectIds)
  return rows.map((r) => r.targetId);
}

module.exports = { getHiddenIdsForUser };
