const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['friendRequest', 'friendRequestAccepted', 'like', 'comment', 'reply', 'event'],
    required: true,
  },
  message: { type: String, required: true },
  relatedId: { type: mongoose.Schema.Types.ObjectId, refPath: 'typeRef' }, // The user who triggered the notification
  typeRef: { type: String, enum: ['User', 'Review', 'Event'] }, // Reference model for `relatedId`
  targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' }, // The review being liked/commented on
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, // The comment that was liked/replied to
  replyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, // The specific reply (if applicable)
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const PhotoSchema = new mongoose.Schema({
  photoKey: { type: String, required: true }, // Unique identifier for the photo (e.g., S3 key)
  uploadedBy: { type: String, required: true }, // Email of the user who uploaded the photo
  description: { type: String, default: null }, // Optional description for the photo
  tags: [{ type: String }], // Optional tags for categorizing the photo
  uploadDate: { type: Date, default: Date.now }, // Date the photo was uploaded
});

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  profilePic: PhotoSchema,
  banner: PhotoSchema,
  isBusiness: {
    type: Boolean,
    required: true,
    default: false, // false for general users, true for businesses
  },
  friends: [
    {
      type: mongoose.Schema.Types.ObjectId, // Each element is an ObjectId
      ref: 'User', // Refers to the User collection
    },
  ],
  friendRequests: {
    sent: [
      {
        type: mongoose.Schema.Types.ObjectId, // References to users you sent requests to
        ref: 'User',
      },
    ],
    received: [
      {
        type: mongoose.Schema.Types.ObjectId, // References to users who sent requests to you
        ref: 'User',
      },
    ],
  },
  notifications: [NotificationSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', UserSchema);
