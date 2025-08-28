const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const LiveChatMessageSchema = new Schema(
  {
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', index: true, required: true },
    userId:       { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },

    // for display without extra joins (optional denormalization)
    userName:     { type: String },
    userPicUrl:   { type: String },

    type: { 
      type: String, 
      enum: ['message','system','join','leave','pin','unpin','gift','likeBurst'], 
      default: 'message', 
      index: true 
    },

    text: { type: String, default: '' },

    // sync to replay (relative time offset). If stream restarts, keep using startedAt baseline.
    offsetSec: { type: Number, index: true }, // seconds since LiveStream.startedAt at send time

    // moderation flags
    deleted:   { type: Boolean, default: false, index: true },
    hiddenBy:  { type: Schema.Types.ObjectId, ref: 'User', default: null }, // moderator id
    reason:    { type: String, default: null },

    // optional lightweight reactions if you want
    reactions: [{
      emoji:   { type: String },
      count:   { type: Number, default: 0 }
    }],
  },
  { timestamps: true }
);

// Core read patterns
LiveChatMessageSchema.index({ liveStreamId: 1, createdAt: 1 }); // paginate forward
LiveChatMessageSchema.index({ liveStreamId: 1, offsetSec: 1 }); // replay-synced fetch
LiveChatMessageSchema.index({ userId: 1, createdAt: -1 });      // user mod tools

module.exports = model('LiveChatMessage', LiveChatMessageSchema);
