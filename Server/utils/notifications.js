const User = require('../models/User');

/**
 * Adds a like notification to a user's notification array
 * - Avoids duplicate notifications for the same liker/post
 * 
 * @param {Object} params
 * @param {string} params.recipientId - The user receiving the notification
 * @param {string} params.likerId - The user who liked the post
 * @param {string} params.fullName - Full name of the liker
 * @param {string} params.targetId - The original post ID
 * @param {string} params.postType - Type of post (review, check-in, etc.)
 */
async function createNotificationForUser({ recipientId, likerId, fullName, targetId, postType }) {
  if (!recipientId || !likerId || recipientId === likerId) return;

  const user = await User.findById(recipientId);
  if (!user) return;

  const alreadyExists = user.notifications.some((n) =>
    n.type === 'like' &&
    n.relatedId?.toString() === likerId &&
    n.targetId?.toString() === targetId &&
    n.postType === postType &&
    n.typeRef === 'User'
  );

  if (alreadyExists) return;

  user.notifications.push({
    type: 'like',
    message: `${fullName} liked your ${postType}`,
    relatedId: likerId,
    typeRef: 'User',
    targetId,
    postType,
    read: false,
    createdAt: new Date(),
  });

  await user.save();
}

module.exports = {
  createNotificationForUser,
};
