const mongoose = require('mongoose');

const HIDDEN_TYPES = [
  'review',
  'check-in',
  'invite',
  'event',
  'promotion',
  'sharedPost',
  'liveStream',
];

const HiddenPostSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },

    // Canonical logical type (NOT model name)
    targetRef: {
      type: String,
      enum: HIDDEN_TYPES,
      required: true,
    },

    // ID of the thing being hidden
    // - review/check-in/invite/sharedPost/liveStream -> Post._id
    // - event -> Event._id
    // - promotion -> Promotion._id
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Optional reason if you ever want to store it
    reason: {
      type: String,
    },

    // You can keep manual createdAt or switch to timestamps; this keeps your existing shape
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'hidden_posts',
    // if you want updatedAt as well, you could instead do:
    // timestamps: { createdAt: true, updatedAt: false },
  }
);

// One row per (user, type, target)
HiddenPostSchema.index(
  { userId: 1, targetRef: 1, targetId: 1 },
  { unique: true }
);

module.exports = mongoose.model('HiddenPost', HiddenPostSchema);
