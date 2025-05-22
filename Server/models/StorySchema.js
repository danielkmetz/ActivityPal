// StorySchema.js
const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema({
  mediaKey: { type: String, required: true }, // e.g., S3 key for photo or video
  mediaType: {
    type: String,
    enum: ['photo', 'video'],
    required: true
  },
  caption: { type: String, default: null },
  taggedUsers: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }, // Auto-calculate 24h expiry when creating story
  visibility: {
    type: String,
    enum: ['public', 'followers', 'friendsOnly'],
    default: 'public'
  },
  viewedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ]
});

module.exports = StorySchema;
