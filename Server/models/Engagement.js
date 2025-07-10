const mongoose = require('mongoose');

const EngagementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  targetType: {
    type: String,
    enum: [
      'place',     // Google Place ID
      'event',     // internal event._id
      'promo',     // internal promo._id
      'user',      // user._id (profile viewed)
      'review',    // review._id (liked/viewed)
      'check-in',  // checkin._id
      'invite'     // invite._id (opened/joined/etc.)
    ],
    required: true
  },

  targetId: {
    type: String, // ObjectId as string or placeId (when targetType is 'place')
    required: true
  },

  engagementType: {
    type: String,
    enum: [
      'view',
      'click',
      'save',
      'interested',
      'follow',
      'like',
      'join',
      'dismiss',
      'share'
    ],
    required: true
  },

  timestamp: {
    type: Date,
    default: Date.now
  }
});

EngagementSchema.index({ targetType: 1, targetId: 1, engagementType: 1, timestamp: -1 });
EngagementSchema.index({ userId: 1, engagementType: 1, timestamp: -1 });

module.exports = mongoose.model('Engagement', EngagementSchema);
