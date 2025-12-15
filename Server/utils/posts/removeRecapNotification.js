const mongoose = require('mongoose');
const { Types } = mongoose;
const User = require('../../models/User');
const { Post } = require('../../models/Post');

const NEEDS_RECAP_TYPE = 'activityInviteNeedsRecap';

// Tune these to your product behavior
const LOOKBACK_HOURS = 72;
const FUTURE_GRACE_HOURS = 3;

const toObjectId = (v) => (v && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null);
const toDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

async function clearOldestNeedsRecapNotification({
  userId,
  createdPostId,
  placeId,
  postTime,
  relatedInviteIdRaw,
}) {
  const userObjectId = toObjectId(userId);
  if (!userObjectId) return;

  const relatedInviteId = toObjectId(relatedInviteIdRaw);

  const anchor = toDate(postTime) || new Date();
  const min = new Date(anchor.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const max = new Date(anchor.getTime() + FUTURE_GRACE_HOURS * 60 * 60 * 1000);

  // Pull notifications once
  const user = await User.findById(userObjectId).select('notifications').lean();
  const notifs = Array.isArray(user?.notifications) ? user.notifications : [];

  // Only consider NEEDS_RECAP notifications that point at a Post
  const needsRecapNotifs = notifs
    .filter((n) => {
      return (
        n?.type === NEEDS_RECAP_TYPE &&
        n?.targetRef === 'Post' &&
        n?.targetId &&
        Types.ObjectId.isValid(n.targetId) &&
        n?._id &&
        Types.ObjectId.isValid(n._id)
      );
    })
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()); // oldest first

  if (!needsRecapNotifs.length) return;

  // 1) If we got an explicit invite id, delete the oldest notif that matches it
  if (relatedInviteId) {
    const oldest = needsRecapNotifs.find((n) => String(n.targetId) === String(relatedInviteId));
    if (!oldest) return;

    await User.updateOne(
      { _id: userObjectId },
      { $pull: { notifications: { _id: oldest._id } } }
    );

    // Optional: lock link on the created post to eliminate future ambiguity
    if (createdPostId && Types.ObjectId.isValid(createdPostId)) {
      await Post.updateOne(
        { _id: createdPostId },
        { $set: { 'refs.relatedInviteId': relatedInviteId } }
      );
    }
    return;
  }

  // 2) Fallback requires placeId — otherwise you cannot safely decide “same place”
  if (!placeId) return;

  // Resolve which of these notifications point to invite posts at the same place/time window
  const targetIds = needsRecapNotifs.map((n) => new Types.ObjectId(n.targetId));

  const matchingInvites = await Post.find({
    _id: { $in: targetIds },
    type: 'invite',
    placeId,
    'details.dateTime': { $gte: min, $lte: max },
    $or: [
      { ownerId: userObjectId },
      { 'details.recipients.userId': userObjectId },
    ],
  })
    .select('_id')
    .lean();

  if (!matchingInvites.length) return;

  const matchSet = new Set(matchingInvites.map((p) => String(p._id)));

  // Oldest notification that targets a matching invite
  const oldestMatchNotif = needsRecapNotifs.find((n) => matchSet.has(String(n.targetId)));
  if (!oldestMatchNotif) return;

  await User.updateOne(
    { _id: userObjectId },
    { $pull: { notifications: { _id: oldestMatchNotif._id } } }
  );

  // Optional: lock link for future
  if (createdPostId && Types.ObjectId.isValid(createdPostId)) {
    await Post.updateOne(
      { _id: createdPostId },
      { $set: { 'refs.relatedInviteId': new Types.ObjectId(oldestMatchNotif.targetId) } }
    );
  }
}

module.exports = { clearOldestNeedsRecapNotification };
