const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { Post } = require('../models/Post');
const User = require('../models/User');
const Business = require('../models/Business');
const verifyToken = require('../middleware/verifyToken'); // Import your middleware
const { resolveUserProfilePics } = require('../utils/userPosts');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const deleteS3Objects = require('../utils/deleteS3Objects');
const getPostPreviews = require('../utils/getPostPreviews');
const { hydratePostForResponse, hydrateManyPostsForResponse } = require('../utils/posts/hydrateAndEnrichForResponse');

// 🧑‍🤝‍🧑 Create or get a conversation between two users
router.post('/conversation', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { recipientId } = req.body;

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
  let { conversationId, recipientIds = [], content, messageType, media } = req.body;

  try {
    let conversation;
    let createdNewConversation = false;

    const isValidConversationId = mongoose.Types.ObjectId.isValid(conversationId);

    // Try to find conversation by participantIds if no ID provided
    if (!conversation && recipientIds.length > 0) {
      const allParticipantIds = [...recipientIds, senderId]
        .map(id => id.toString())
        .sort();

      conversation = await Conversation.findOne({
        participants: { $all: allParticipantIds, $size: allParticipantIds.length },
      });

      if (!conversation) {
        conversation = new Conversation({ participants: allParticipantIds });
        await conversation.save();
        createdNewConversation = true;
        conversationId = conversation._id;
      } else {
        conversationId = conversation._id;
      }
    }

    if (!conversation) {
      return res.status(400).json({
        error: 'Conversation not found. Provide a valid conversationId or recipientId.',
      });
    }

    // Validate sender is part of the conversation
    if (!conversation.participants.map(p => p.toString()).includes(senderId)) {
      return res.status(403).json({ error: 'You are not a participant in this conversation.' });
    }

    // Create and save the message
    const messageData = {
      conversationId,
      senderId,
      content,
      messageType,
      media,
    };

    if (
      messageType === 'post' &&
      req.body.post?.postId &&
      req.body.post?.postType
    ) {
      messageData.post = {
        postId: req.body.post.postId,
        postType: req.body.post.postType,
      };
    }

    const message = new Message(messageData);
    await message.save();

    // Convert to plain object
    let enrichedMessage = message.toObject();

    // Enrich post preview if applicable (using hydratePostForResponse)
    if (
      message.messageType === 'post' &&
      message.post?.postId
    ) {
      try {
        const { postId, postType } = message.post;
        let preview = null;

        // 1) First, assume postId is a unified Post _id
        let rawPost = await Post.findById(postId).lean();

        // 2) If we didn't find a Post (or if this is clearly an event/promo),
        //    use the same sharedPost-stub trick as the stories route so the
        //    helper can load from Post/Promotion/Event under the hood.
        if (!rawPost && (postType === 'event' || postType === 'promotion' || postType === 'promo')) {
          const sharedStub = {
            type: 'sharedPost',
            shared: { originalPostId: postId },
          };

          const hydratedStub = await hydratePostForResponse(sharedStub);
          // Prefer the original if present, otherwise just use the stub
          preview = hydratedStub?.original || hydratedStub || null;
        } else if (rawPost) {
          // Normal unified Post case (reviews, check-ins, invites, sharedPost, liveStream, etc.)
          preview = await hydratePostForResponse(rawPost);
        }

        enrichedMessage.postPreview = preview || null;
      } catch (err) {
        console.error('[DM /message] Failed to hydrate post preview', {
          post: message.post,
          error: err?.message,
        });
        enrichedMessage.postPreview = null;
      }
    }

    // Update conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    // Add media URL if present
    if (message.media?.photoKey) {
      try {
        enrichedMessage.media.url = await getPresignedUrl(message.media.photoKey);
      } catch (urlError) {
        console.warn('⚠️ Failed to generate media URL:', urlError.message);
      }
    }

    // 🔔 Emit to participants on the DM NAMESPACE (not root)  // CHANGED
    const io = req.app.get('io');
    const dm = io.of('/dm');
    conversation.participants.forEach((participantId) => {
      const pid = participantId.toString();
      if (pid !== senderId) {
        dm.to(pid).emit('newMessage', enrichedMessage); // or 'dm:newMessage'
      }
    });

    // Enrich conversation if new
    let enrichedConversation = null;
    if (createdNewConversation) {
      const otherUserIds = conversation.participants
        .map(id => id.toString())
        .filter(id => id !== senderId);

      const [userDocs, businessDocs] = await Promise.all([
        User.find({ _id: { $in: otherUserIds } }).lean(),
        Business.find({ _id: { $in: otherUserIds } }).lean(),
      ]);

      const profileMap = await resolveUserProfilePics(otherUserIds);

      const otherUsers = [...userDocs.map(u => ({
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        profilePic: profileMap[u._id]?.profilePic || null,
        profilePicUrl: profileMap[u._id]?.profilePicUrl || null,
        type: 'User',
      })), ...businessDocs.map(b => ({
        _id: b._id,
        firstName: b.businessName,
        lastName: '',
        username: b.username || b.businessName,
        profilePic: profileMap[b._id]?.profilePic || null,
        profilePicUrl: profileMap[b._id]?.profilePicUrl || null,
        type: 'Business',
      }))];

      enrichedConversation = {
        _id: conversation._id,
        participants: conversation.participants,
        updatedAt: new Date(),
        lastMessage: message,
        otherUsers: otherUsers.map(user => ({
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          profilePic: profileMap[user._id]?.profilePic || null,
          profilePicUrl: profileMap[user._id]?.profilePicUrl || null,
        })),
        __v: 0,
      };
    }

    res.json({
      message: enrichedMessage,
      conversationId,
      ...(enrichedConversation ? { conversation: enrichedConversation } : {}),
    });
  } catch (err) {
    console.error('❌ Unexpected error in /message:', err.message);
    res.status(500).json({ error: 'Failed to send message.', details: err.message });
  }
});

// 📬 Get all conversations for current user
router.get('/conversations', verifyToken, async (req, res) => {
  const userId = req.user.id;

  try {
    // Fetch conversations with the current user
    const conversations = await Conversation.find({ participants: userId })
      .populate('lastMessage')
      .lean();

    // Collect all other participant IDs
    const allOtherUserIds = new Set();

    conversations.forEach(conv => {
      conv.participants.forEach(id => {
        if (id.toString() !== userId) {
          allOtherUserIds.add(id.toString());
        }
      });
    });

    const otherUserIdsArray = Array.from(allOtherUserIds);

    // Fetch user data
    const [users, businesses] = await Promise.all([
      User.find({ _id: { $in: otherUserIdsArray } }).select('_id firstName lastName profilePic').lean(),
      Business.find({ _id: { $in: otherUserIdsArray } }).select('_id businessName logoKey').lean(),
    ]);

    // Build lookup maps
    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = {
        _id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        profilePic: u.profilePic || null,
        type: 'User',
      };
    });
    businesses.forEach(b => {
      userMap[b._id.toString()] = {
        _id: b._id,
        firstName: b.businessName,
        lastName: '',
        profilePic: b.logoKey || null,
        type: 'Business',
      };
    });

    const picMap = await resolveUserProfilePics(otherUserIdsArray);

    // Enrich conversations
    const enrichedConversations = conversations.map(conv => {
      const otherParticipants = conv.participants
        .filter(id => id.toString() !== userId)
        .map(id => {
          const participant = userMap[id.toString()] || {};
          const picData = picMap[id.toString()] || {};
          return {
            ...participant,
            profilePicUrl: picData.profilePicUrl || null,
          };
        });

      return {
        ...conv,
        otherUsers: otherParticipants,
      };
    });

    res.json(enrichedConversations);
  } catch (err) {
    console.error('❌ Failed to fetch conversations:', err);
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

// 💬 Get all messages in a conversation
router.get('/messages/:conversationId', verifyToken, async (req, res) => {
  const { conversationId } = req.params;
  const currentUserId = req.user.id; // Assuming verifyToken adds `user` to `req`

  try {
    const messages = await Message.find({ conversationId }).sort('sentAt').lean();

    // 1️⃣ Collect all messages that reference a post
    const postMessages = messages.filter(
      (msg) =>
        msg.messageType === 'post' &&
        msg.post?.postId &&
        msg.post?.postType
    );

    // 2️⃣ Build sharedPost stubs so hydrateManyPostsForResponse can:
    //    - load original from Post/Promotion/Event
    //    - enrich via enrichOneOrMany
    let previewByMessageId = new Map();

    if (postMessages.length > 0) {
      const stubs = postMessages.map((msg) => ({
        type: 'sharedPost',
        shared: {
          originalPostId: msg.post.postId,
        },
      }));

      // Hydrate all stubs in one shot
      const hydratedStubs = await hydrateManyPostsForResponse(stubs);

      // Map hydrated preview back to each message by its _id
      previewByMessageId = new Map();
      postMessages.forEach((msg, idx) => {
        const hydrated = hydratedStubs[idx];
        // Prefer the hydrated original (real post/promo/event),
        // fall back to the stub itself if original missing.
        const preview = hydrated?.original || hydrated || null;
        previewByMessageId.set(String(msg._id), preview);
      });
    }

    // 3️⃣ Collect unique sender IDs that are not the current user
    const otherSenderIds = [
      ...new Set(
        messages
          .filter((msg) => String(msg.senderId) !== String(currentUserId))
          .map((msg) => String(msg.senderId))
      ),
    ];

    // 4️⃣ Resolve profile picture URLs for these sender IDs
    const profilePicMap = await resolveUserProfilePics(otherSenderIds);
    // Should return: { userId1: url1, userId2: url2, ... }

    // 5️⃣ Enrich messages with media URL, post preview, and profile pic
    const enrichedMessages = await Promise.all(
      messages.map(async (msg) => {
        // 🖼️ Media presigned URL
        if (msg.media?.photoKey) {
          try {
            msg.media.url = await getPresignedUrl(msg.media.photoKey);
          } catch (err) {
            console.warn(
              `⚠️ Failed to get presigned URL for ${msg.media.photoKey}:`,
              err.message
            );
          }
        }

        // 🧩 Post preview using hydrated posts
        if (msg.messageType === 'post') {
          const preview = previewByMessageId.get(String(msg._id)) || null;
          msg.postPreview = preview;
        }

        // 🧑 Profile picture if sender ≠ current user
        if (String(msg.senderId) !== String(currentUserId)) {
          msg.senderProfilePic = profilePicMap[String(msg.senderId)] || null;
        }

        return msg;
      })
    );

    res.json(enrichedMessages);
  } catch (err) {
    console.error('❌ Failed to fetch messages:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

router.delete('/message/:messageId', verifyToken, async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user.id;

  try {
    const message = await Message.findById(messageId).lean();
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (String(message.senderId) !== String(userId)) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    // find conversation to get participants
    const conversation = await Conversation.findById(message.conversationId).lean();
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    // delete media if any
    if (message.media?.photoKey) {
      await deleteS3Objects([message.media.photoKey]).catch(() => { });
    }

    await Message.findByIdAndDelete(messageId);

    // 🔔 emit to /dm namespace personal rooms
    const io = req.app.get('io');
    const dm = io.of('/dm');
    const payload = { messageId, conversationId: String(message.conversationId) };

    conversation.participants.forEach((pid) => {
      dm.to(pid.toString()).emit('messageDeleted', payload);
    });

    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('❌ Failed to delete message:', err.message);
    res.status(500).json({ error: 'Failed to delete message', details: err.message });
  }
});

router.put('/message/:messageId', verifyToken, async (req, res) => {
  const { messageId } = req.params;
  const { content, media } = req.body; // media may be null or { photoKey, mediaType }
  const userId = req.user.id;

  try {
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (String(message.senderId) !== String(userId)) {
      return res.status(403).json({ error: 'Not authorized to edit this message' });
    }

    const conversation = await Conversation.findById(message.conversationId).lean();
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const oldKey = message.media?.photoKey || null;
    const newKey = media?.photoKey || null;

    // Case 1: remove media
    if (!media && oldKey) {
      await deleteS3Objects([oldKey]).catch(() => { });
      message.media = null;
    }
    // Case 2: swap media
    else if (media && oldKey && oldKey !== newKey) {
      await deleteS3Objects([oldKey]).catch(() => { });
      message.media = media;
    }
    // Case 3: add new media
    else if (media && !oldKey) {
      message.media = media;
    }

    // content + timestamp
    message.content = content;
    message.updatedAt = new Date();
    await message.save();

    // Build response + include fresh URL if present
    const edited = message.toObject();
    if (edited.media?.photoKey) {
      try {
        edited.media.url = await getPresignedUrl(edited.media.photoKey);
      } catch { }
    }

    // 🔔 emit to /dm namespace
    const io = req.app.get('io');
    const dm = io.of('/dm');
    const payload = {
      message: {
        _id: String(edited._id),
        conversationId: String(edited.conversationId),
        senderId: String(edited.senderId),
        content: edited.content,
        media: edited.media || null,
        messageType: edited.messageType,
        updatedAt: edited.updatedAt,
      },
    };

    conversation.participants.forEach((pid) => {
      dm.to(pid.toString()).emit('messageEdited', payload);
    });

    res.json(payload);
  } catch (err) {
    console.error('❌ Failed to edit message:', err.message);
    res.status(500).json({ error: 'Failed to edit message', details: err.message });
  }
});

// ✅ Mark all messages in a conversation as read
router.put('/messages/read/:conversationId', verifyToken, async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;

  try {
    // Mark all unread messages that were sent to this user
    const result = await Message.updateMany(
      {
        conversationId,
        senderId: { $ne: userId },
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    console.log(`✅ Marked ${result.modifiedCount || result.nModified} messages as read`);
    res.json({ success: true, updated: result.modifiedCount || result.nModified });
  } catch (err) {
    console.error('❌ Failed to mark messages as read:', err.message);
    res.status(500).json({ error: 'Failed to update read status', details: err.message });
  }
});

module.exports = router;
