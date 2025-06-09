const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  messageType: {
    type: String,
    enum: ['text', 'photo', 'video', 'story', 'checkIn'],
    default: 'text',
  },
  content: {
    type: String,
    required: true,
  },
  media: {
    url: { type: String, default: null },
    mediaType: { type: String, enum: ['image', 'video'], default: null },
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
});

const Message = mongoose.model('Message', MessageSchema);
module.exports = Message;
