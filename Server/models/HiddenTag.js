const mongoose = require('mongoose');

const TAGGABLE_TYPES = [
  'review',
  'check-in',
  'invite',
  'event',
  'promotion',
  'sharedPost',
  'liveStream',
];

const HiddenTagSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Canonical logical type (NOT model name)
    targetRef: {
      type: String,
      enum: TAGGABLE_TYPES,
      required: true,
    },

    // ID of the thing they’re tagged in
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// One row per (user, type, target)
HiddenTagSchema.index(
  { userId: 1, targetRef: 1, targetId: 1 },
  { unique: true }
);

// Helpful for "list hidden" UIs / admin tools
HiddenTagSchema.index({ userId: 1, createdAt: -1 });

const HiddenTag = mongoose.model('HiddenTag', HiddenTagSchema);
module.exports = HiddenTag;
