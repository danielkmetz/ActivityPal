const mongoose = require('mongoose');
const BlockEdge = require('../models/BlockEdge');
const User = require('../models/User');

async function getBlockSets(userId) {
  const [iBlock, blockMe] = await Promise.all([
    BlockEdge.find({ blocker: userId }).select('blocked').lean(),
    BlockEdge.find({ blocked: userId }).select('blocker').lean(),
  ]);
  return {
    blockedIds: new Set(iBlock.map(x => String(x.blocked))),
    blockedByIds: new Set(blockMe.map(x => String(x.blocker))),
  };
}

async function blockUser(blockerId, targetId) {
  if (!blockerId || !targetId) throw new Error('Missing ids');
  if (String(blockerId) === String(targetId)) throw new Error('Cannot block yourself');

  // Upsert the block edge
  await BlockEdge.updateOne(
    { blocker: blockerId, blocked: targetId },
    { $setOnInsert: { blocker: blockerId, blocked: targetId } },
    { upsert: true }
  );

  // Sever social ties immediately (no auto-restore on unblock)
  await Promise.all([
    // Remove follow relationships and requests both ways
    User.updateOne(
      { _id: blockerId },
      { 
        $pull: { 
          following: targetId, 
          followers: targetId, 
          followRequestsSent: targetId, 
          followRequestsReceived: targetId 
        } 
      }
    ),
    User.updateOne(
      { _id: targetId },
      { 
        $pull: { 
          following: blockerId, 
          followers: blockerId, 
          followRequestsSent: blockerId, 
          followRequestsReceived: blockerId 
        } 
      }
    ),
    // (Optional) Clean up notifications in your existing system
    // removeAllNotificationsBetween(blockerId, targetId),
    // (Optional) Close DMs / leave conversations, etc.
    // closeDmThreadsBetween(blockerId, targetId),
  ]);

  return { ok: true };
}

async function unblockUser(blockerId, targetId) {
  if (!blockerId || !targetId) throw new Error('Missing ids');
  await BlockEdge.deleteOne({ blocker: blockerId, blocked: targetId });
  return { ok: true };
}

/**
 * Quick check before allowing interactions:
 * returns true if either direction blocks the other
 */
async function isBlockedEitherDirection(a, b) {
  const edge = await BlockEdge.findOne({
    $or: [{ blocker: a, blocked: b }, { blocker: b, blocked: a }]
  }).lean();
  return !!edge;
}

/**
 * Feed/filter helper: build author exclusion sets for userId
 */
async function getAuthorExclusionSets(userId) {
  const { blockedIds, blockedByIds } = await getBlockSets(userId);
  // Authors we must hide: users I blocked and users who blocked me
  const excludeAuthorIds = Array.from(new Set([...blockedIds, ...blockedByIds]));
  return { excludeAuthorIds, blockedIds, blockedByIds };
}

module.exports = {
  blockUser,
  unblockUser,
  getBlockSets,
  isBlockedEitherDirection,
  getAuthorExclusionSets,
};
