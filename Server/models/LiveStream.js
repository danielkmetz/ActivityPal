// Server/models/LiveStream.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const { CommentSchema } = require('./Comment.js');
const { LikeSchema } = require('./Likes.js');

const LiveStreamSchema = new Schema(
  {
    // IVS channel + endpoints
    channelArn:     { type: String, index: true },
    ingestEndpoint: { type: String },
    playbackUrl:    { type: String },

    // IVS stream key (store secret securely; hidden by default)
    streamKeyArn:    { type: String, default: null },
    streamKeyLast4:  { type: String, default: null },
    streamKeySecret: { type: String, default: null, select: false },

    // ownership
    hostUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },

    // optional place linkage (keep String if that’s how you store it)
    placeId: { type: String, index: true, default: null },

    title: { type: String, default: '' },

    // session state
    status:   { type: String, enum: ['idle', 'live', 'ended', 'error'], default: 'idle', index: true },
    isActive: { type: Boolean, default: false, index: true },
    startedAt:{ type: Date },
    endedAt:  { type: Date },

    // metrics
    stats: {
      viewerPeak:    { type: Number, default: 0 },
      uniqueViewers: { type: Number, default: 0 },
    },

    // recording / replay
    recording: {
      enabled:   { type: Boolean, default: false },
      vodUrl:    { type: String },
      s3Key:     { type: String },
      expiresAt: { type: Date },
    },

    savedToProfile: { type: Boolean, default: false, index: true },
    visibility:     { type: String, enum: ['public', 'followers', 'private', 'unlisted'], default: 'public', index: true },
    coverKey:       { type: String },
    durationSec:    { type: Number },

    // linkage to a feed post later
    isPosted:     { type: Boolean, default: false, index: true },
    sharedPostId: { type: Schema.Types.ObjectId, ref: 'Post', default: null },
    caption: {type: String, default: null},
    likes: [LikeSchema],
    comments: [CommentSchema]
  },
  { timestamps: true }
);

// Helpful indexes
LiveStreamSchema.index({ hostUserId: 1, createdAt: -1 });
LiveStreamSchema.index({ placeId: 1, createdAt: -1 });
LiveStreamSchema.index(
  { hostUserId: 1, placeId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
LiveStreamSchema.index(
  { isActive: 1, placeId: 1, createdAt: -1 },
  { partialFilterExpression: { isActive: true } }
);

module.exports = model('LiveStream', LiveStreamSchema);
