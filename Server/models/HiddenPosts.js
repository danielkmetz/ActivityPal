const mongoose = require('mongoose');

const HiddenPost = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  targetRef: { type: String, enum: ['Review','CheckIn','SharedPost','ActivityInvite','Event','Promotion'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  reason: { type: String },         // optional: "not relevant", "seen", etc.
  createdAt: { type: Date, default: Date.now, index: true },
}, {
  collection: 'hidden_posts'
});

HiddenPost.index({ userId: 1, targetRef: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model('HiddenPost', HiddenPost);
