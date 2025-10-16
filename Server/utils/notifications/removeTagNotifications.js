const mongoose = require('mongoose');
const User = require('../../models/User'); // ← adjust path

/**
 * Remove notifications for a user matching (type ∈ types) + targetRef + targetId.
 * Returns the number of notifications removed.
 *
 * NOTE: Your NotificationSchema has no photoId field. This can only remove by post,
 *       not by individual photo within the post. If you want per-photo precision,
 *       add photoId: { type: ObjectId, ref: 'Photo', default: null } to notifications.
 */
async function removeTagNotifications({ userId, targetRef, targetId, types = ['tag', 'photoTag'] }) {
  if (!userId || !targetRef || !targetId || !Array.isArray(types) || types.length === 0) return 0;

  const postObjectId = new mongoose.Types.ObjectId(String(targetId));

  // Read once to compute exact subdoc IDs for precise $pull
  const beforeUser = await User.findById(userId, { notifications: 1 }).lean();
  if (!beforeUser) return 0;

  const candidates = (beforeUser.notifications || []).filter((n) =>
    n &&
    types.includes(n.type) &&
    String(n.targetRef) === String(targetRef) &&
    n.targetId && String(n.targetId) === String(postObjectId)
  );

  if (candidates.length) {
    const ids = candidates.map((n) => n._id);
    const res = await User.updateOne(
      { _id: userId },
      { $pull: { notifications: { _id: { $in: ids } } } }
    );
    // res.modifiedCount is not the exact count; return what we targeted
    return ids.length;
  }

  // Fallback: filter-based pull (covers any mismatched subdoc _id edge cases)
  const pullRes = await User.updateOne(
    { _id: userId },
    {
      $pull: {
        notifications: {
          type: { $in: types },
          targetId: postObjectId,
          targetRef: targetRef,
        },
      },
    }
  );

  // Best-effort compute actual removed count
  if (pullRes?.modifiedCount) {
    const afterUser = await User.findById(userId, { notifications: 1 }).lean();
    const beforeCount = beforeUser.notifications?.length || 0;
    const afterCount = afterUser?.notifications?.length || 0;
    return Math.max(0, beforeCount - afterCount);
  }

  return 0;
}

module.exports = { removeTagNotifications };
