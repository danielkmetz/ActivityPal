const mongoose = require('mongoose');

const HiddenTagSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetRef:  { type: String, enum: ['Review', 'CheckIn'], required: true },
  targetId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  createdAt:  { type: Date, default: Date.now },
});

// One row per (user, postType, postId)
HiddenTagSchema.index({ userId: 1, targetRef: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model('HiddenTag', HiddenTagSchema);
