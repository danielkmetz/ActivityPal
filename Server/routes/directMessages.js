const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const verifyToken = require('../middleware/verifyToken'); // Import your middleware
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const { resolveUserProfilePics } = require('../utils/userPosts');

// 🧑‍🤝‍🧑 Create or get a conversation between two users
router.post('/conversation', verifyToken, async (req, res) => {
  const { userId } = req.user;
  const { recipientId } = req.body;

  try {
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, recipientId] },
    });

    if (!conversation) {
      conversation = new Conversation({ participants: [userId, recipientId] });
      await conversation.save();
    }

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create or fetch conversation.' });
  }
});

// 📩 Send a new message
router.post('/message', verifyToken, async (req, res) => {
  const { id } = req.user;
  const { conversationId, recipientId, content, messageType, media } = req.body;

  try {
    const message = new Message({
      conversationId,
      senderId: id,
      receiverId: recipientId,
      content,
      messageType,
      media,
    });

    await message.save();

    // Update the last message for preview
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    // Emit message to recipient in real-time
    req.app.get('io').to(recipientId).emit('newMessage', message);

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// 💬 Get all messages in a conversation
router.get('/messages/:conversationId', verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({ conversationId: req.params.conversationId }).sort('sentAt');
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// 📬 Get all conversations for current user
router.get('/conversations', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const conversations = await Conversation.find({ participants: userId })
      .populate('lastMessage')
      .lean();

    // 🧠 Get all other user IDs from conversations
    const otherUserIds = conversations
      .map(conv => conv.participants.find(id => id.toString() !== userId))
      .filter(Boolean); // Remove nulls

    // 🖼️ Resolve presigned URLs for all other users
    const userPicMap = await resolveUserProfilePics(otherUserIds);

    // 🧩 Enrich each conversation
    const enrichedConversations = conversations.map(conv => {
      const otherUserId = conv.participants.find(id => id.toString() !== userId);
      const picData = userPicMap[otherUserId?.toString()] || {};

      return {
        ...conv,
        otherUser: {
          _id: otherUserId,
          profilePic: picData.profilePic || null,
          profilePicUrl: picData.profilePicUrl || null,
        },
      };
    });

    res.json(enrichedConversations);
  } catch (err) {
    console.error('❌ Failed to fetch conversations:', err);
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

module.exports = router;
