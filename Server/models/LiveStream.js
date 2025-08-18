const mongoose = require('mongoose')

const LiveStreamSchema = new mongoose.Schema({
  channelArn: { type: String, index: true },
  ingestEndpoint: String,
  playbackUrl: String,

  streamKeyArn: String,
  streamKeyLast4: String,

  hostUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  // Optional, auto-filled if available
  placeId: { type: String, index: true, default: null },
  title: { type: String, default: '' },

  status: { type: String, enum: ['idle','live','ended','error'], default: 'idle', index: true },
  isActive: { type: Boolean, default: false, index: true },
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
