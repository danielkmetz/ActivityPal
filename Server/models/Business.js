const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
  photoKey: { type: String, required: true }, // Unique identifier for the photo (e.g., S3 key)
  uploadedBy: { type: String, required: true }, // User who uploaded the photo
  description: { type: String, default: null }, // Optional description for the photo
  taggedUsers: [
    {
      userId: { type: String, required: true }, // Store user ID reference
      x: { type: Number, required: true }, // X coordinate of tag
      y: { type: Number, required: true }, // Y coordinate of tag
    },
  ], // Tagged users with coordinates
  uploadDate: { type: Date, default: Date.now }, // Date the photo was uploaded
});

const NotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'friendRequest',
      'friendRequestAccepted',
      'like',
      'comment',
      'reply',
      'event',
      'tag',
      'photoTag',
      'activityInvite',
      'activityInviteAccepted',
      'activityInviteDeclined',
      'requestInvite',
      'review',
      'check-in',
    ],
    required: true,
  },
  message: { type: String, required: true },
  relatedId: { type: mongoose.Schema.Types.ObjectId, refPath: 'typeRef' }, // The user who triggered the notification
  typeRef: { type: String, enum: ['User', 'Review', 'Event', 'CheckIn', 'ActivityInvite', "Promotion"] }, // Reference model for `relatedId`
  targetId: { type: mongoose.Schema.Types.ObjectId, refPath: 'targetRef' },
  targetRef: { type: String, enum: ['Review', 'ActivityInvite', null] },
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, // The comment that was liked/replied to
  replyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, // The specific reply (if applicable)  
  read: { type: Boolean, default: false },
  postType: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

const BusinessSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true, // Store the business owner's email directly
  },
  password: {
    type: String,
    required: true,
  },
  placeId: {
    type: String,
    required: true,
    unique: true,
  },
  businessName: {
    type: String,
    required: true,
  },
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
    },
    formattedAddress: {
      type: String,
      required: true,
    }
  },
  phone: {
    type: String,
    default: null,
  },
  description: {
    type: String,
    default: null,
  },
  logoKey: {
    type: String,
    default: null,
  },
  bannerKey: {
    type: String,
    default: null,
  },
  photos: [PhotoSchema],
  notifications: [NotificationSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

BusinessSchema.index({ location: "2dsphere" });

module.exports = mongoose.model('Business', BusinessSchema);
