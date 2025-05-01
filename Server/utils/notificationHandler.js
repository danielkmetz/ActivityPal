const User = require('../models/User.js');

/**
 * Handles creation or removal of a notification for a user.
 */
async function handleNotification({
  type,
  recipientId,
  actorId,
  message,
  commentId = null,
  replyId = null,
  targetId = null,
  postType = null,
  isCreate = true,
}) {
  try {
    if (!recipientId || !actorId || recipientId.toString() === actorId.toString()) {
      console.warn("❌ Skipping notification — invalid or self-targeted.");
      return;
    }

    const user = await User.findById(recipientId);
    if (!user) {
      console.warn(`❌ User not found for recipientId: ${recipientId}`);
      return;
    }

    const match = (n) =>
      n.type === type &&
      n.commentId?.toString() === (commentId?.toString() || '') &&
      n.replyId?.toString() === (replyId?.toString() || '') &&
      n.postType?.toString() === (postType?.toString() || '');
      
    console.log(`🔔 handleNotification called (${isCreate ? 'CREATE' : 'REMOVE'})`);
    console.log({ type, recipientId, actorId, commentId, replyId, targetId, postType, message });

    if (isCreate) {
      const alreadyExists = user.notifications.some(match);
      if (alreadyExists) {
        console.log("⚠️ Notification already exists. Skipping insert.");
      } else {
        user.notifications.push({
          type,
          message,
          relatedId: actorId,
          typeRef: 'User',
          targetId,
          commentId,
          replyId,
          postType,
        });
        console.log("✅ Notification added.");
      }
    } else {
      const originalCount = user.notifications.length;
      user.notifications = user.notifications.filter(n => !match(n));
      const newCount = user.notifications.length;
      const removedCount = originalCount - newCount;

      console.log(`🗑️ Removed ${removedCount} matching notification(s).`);
    }

    await user.save();
    console.log("💾 User document saved with notification changes.");
  } catch (error) {
    console.error("🚨 Error in handleNotification:", error);
  }
}

module.exports = {
  handleNotification,
};
