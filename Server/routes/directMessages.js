const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken'); // Import your middleware
const { resolveUserProfilePics } = require('../utils/userPosts');

// 🧑‍🤝‍🧑 Create or get a conversation between two users
router.post('/conversation', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { recipientId } = req.body;

  console.log('📥 [POST /conversation] Incoming request:', { userId, recipientId });

  try {
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, recipientId] },
    });

    let messages = [];

    if (!conversation) {
      conversation = new Conversation({ participants: [userId, recipientId] });
      await conversation.save();
      console.log('🆕 New conversation created:', conversation._id);
    } else {
      console.log('✅ Found existing conversation:', conversation._id);
      messages = await Message.find({ conversationId: conversation._id }).sort('sentAt');
      console.log(`💬 Loaded ${messages.length} messages`);
    }

    res.json({
      conversation,
      messages,
    });
  } catch (err) {
    console.error('❌ Error in /conversation:', err);
    res.status(500).json({ error: 'Failed to create or fetch conversation.' });
  }
});

router.post('/message', verifyToken, async (req, res) => {
  const senderId = req.user.id;
  let { conversationId, recipientId, content, messageType, media } = req.body;

  try {
    // Step 1: Check for valid conversation or create new
    let conversation;
    const isValidId = mongoose.Types.ObjectId.isValid(conversationId);
    let createdNewConversation = false;

    if (isValidId) {
      conversation = await Conversation.findById(conversationId);
    }

    if (!conversation) {
      conversation = new Conversation({ participants: [senderId, recipientId] });
      await conversation.save();
      conversationId = conversation._id;
      createdNewConversation = true;
    }

    // Step 2: Create and save the message
    const message = new Message({
      conversationId,
      senderId,
      receiverId: recipientId,
      content,
      messageType,
      media,
    });

    await message.save();

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    // Step 3: Emit to recipient via Socket.IO
    req.app.get('io').to(recipientId).emit('newMessage', message);

    // Step 4: If new conversation, build enriched response
    let enrichedConversation = null;

    if (createdNewConversation) {
      const otherUserId = String(senderId) === String(conversation.participants[0])
        ? conversation.participants[1]
        : conversation.participants[0];

      const [otherUserDoc] = await User.find({ _id: otherUserId }).lean();
      const profileMap = await resolveUserProfilePics([otherUserId]);

      enrichedConversation = {
        _id: conversation._id,
        participants: conversation.participants,
        updatedAt: new Date(),
        lastMessage: message,
        otherUser: {
          _id: otherUserDoc._id,
          firstName: otherUserDoc.firstName,
          lastName: otherUserDoc.lastName,
          username: otherUserDoc.username,
          profilePic: profileMap[otherUserId]?.profilePic || null,
          profilePicUrl: profileMap[otherUserId]?.profilePicUrl || null,
        },
        __v: 0,
      };
    }

    res.json({
      message,
      conversationId,
      ...(enrichedConversation ? { conversation: enrichedConversation } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// 💬 Get all messages in a conversation
router.get('/messages/:conversationId', verifyToken, async (req, res) => {
  const { conversationId } = req.params;
  
  try {
    const messages = await Message.find({ conversationId }).sort('sentAt');
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

    const otherUserIds = conversations
      .map(conv => conv.participants.find(id => id.toString() !== userId))
      .filter(Boolean);

    const otherUsers = await User.find({ _id: { $in: otherUserIds } })
      .select('_id firstName lastName profilePic')
      .lean();

    const userMap = {};
    otherUsers.forEach(user => {
      userMap[user._id.toString()] = user;
    });

    const picMap = await resolveUserProfilePics(otherUserIds);
    
    const enrichedConversations = conversations.map(conv => {
      const otherUserId = conv.participants.find(id => id.toString() !== userId);
      const userData = userMap[otherUserId?.toString()] || {};
      const picData = picMap[otherUserId?.toString()] || {};

      return {
        ...conv,
        otherUser: {
          _id: otherUserId,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          profilePic: userData.profilePic || null,
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
