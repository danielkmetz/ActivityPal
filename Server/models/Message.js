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
  messageType: {
    type: String,
    enum: ['text', 'photo', 'video', 'story', 'checkIn', 'image', 'post'],
    default: 'text',
  },
  content: {
    type: String,
    required: true,
  },
  media: {
    photoKey: { type: String, default: null },
    mediaType: {
      type: String,
      default: null,
      validate: {
        validator: function (v) {
          return v === null || ['image', 'video'].includes(v);
        },
        message: props => `${props.value} is not a valid mediaType`,
      },
    },
  },
  post: {
    postId: { type: mongoose.Schema.Types.ObjectId },
    postType: {
      type: String,
      enum: ['review', 'check-in', 'invite'],  
    },
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
