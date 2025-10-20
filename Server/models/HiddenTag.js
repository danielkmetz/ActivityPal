const mongoose = require('mongoose');

const HiddenTagSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetRef: { type: String, enum: ['Review', 'CheckIn'], required: true }, // match Model.modelName
    targetId:  { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // cleaner than manual createdAt
  }
);

// One row per (user, postType, postId)
HiddenTagSchema.index({ userId: 1, targetRef: 1, targetId: 1 }, { unique: true });

// Helpful for "list hidden" UIs / admin tools
HiddenTagSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('HiddenTag', HiddenTagSchema);
