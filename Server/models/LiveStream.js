const mongoose = require('mongoose');

const LiveStreamSchema = new mongoose.Schema({
  channelId: String,
  playbackUrl: String,
  streamKeyId: String,         // store the IVS stream key ID (not the secret key)
  hostUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  placeId: String,
  title: String,
  isActive: { type: Boolean, default: false },
  startedAt: Date,
  endedAt: Date,
  stats: {
    viewerPeak: { type: Number, default: 0 },
    uniqueViewers: { type: Number, default: 0 },
  },
  recording: {
    enabled: { type: Boolean, default: false },
    vodUrl: String,
    s3Key: String,
    expiresAt: Date,
  }
}, { timestamps: true });

module.exports = mongoose.model('LiveStream', LiveStreamSchema);
