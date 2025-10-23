const mongoose = require('mongoose');

const BlockEdgeSchema = new mongoose.Schema(
  {
    blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// One edge per pair
BlockEdgeSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

module.exports = mongoose.model('BlockEdge', BlockEdgeSchema);
