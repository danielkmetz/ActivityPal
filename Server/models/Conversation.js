const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  ],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ConversationSchema.index({ participants: 1 }); // Helps optimize lookup

const Conversation = mongoose.model('Conversation', ConversationSchema);
module.exports = Conversation;
