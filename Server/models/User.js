const mongoose = require('mongoose');
const ActivityInviteSchema = require('../models/ActivityInvites'); 

const PhotoSchema = new mongoose.Schema({
  photoKey: { type: String, required: true }, // Unique identifier for the photo (e.g., S3 key)
  uploadedBy: { type: String, required: true }, // Email of the user who uploaded the photo
  description: { type: String, default: null }, // Optional description for the photo
  taggedUsers: [
    {
      userId: { type: String, required: true }, // Store user ID reference
      x: { type: Number, required: true }, // X coordinate of tag
      y: { type: Number, required: true }, // Y coordinate of tag
    },
  ],
  uploadDate: { type: Date, default: Date.now }, // Date the photo was uploaded
});

const ReplySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  replies: [this],
});

// Define a recursive CommentSchema
const CommentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  replies: [ReplySchema], // Self-referencing replies for recursive nesting
});

const CheckInSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // References the User model
    required: true
  },
  placeId: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now // Auto-generates timestamp
  },
  message: {
    type: String,
    maxlength: 500 // Optional check-in message
  },
  photos: [ PhotoSchema ] ,
  taggedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User" // References User model to tag friends
    }
  ],
  likes: [
    {
      userId: { type: String, required: true },
      fullName: { type: String, required: true },
      date: { type: Date, default: Date.now },
    },
  ],
  comments: [CommentSchema]
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
    ],
    required: true,
  },
  message: { type: String, required: true },
  relatedId: { type: mongoose.Schema.Types.ObjectId, refPath: 'typeRef' }, // The user who triggered the notification
  typeRef: { type: String, enum: ['User', 'Review', 'Event', 'CheckIn', 'ActivityInvite'] }, // Reference model for `relatedId`
  targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review' }, // The review being liked/commented on
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, // The comment that was liked/replied to
  replyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null }, // The specific reply (if applicable)
  commentText: { type: String, default: null },
  read: { type: Boolean, default: false },
  postType: {type: String, default: null},
  createdAt: { type: Date, default: Date.now },
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
  checkIns: [CheckInSchema],
  favorites: [
    {
      placeId: { type: String, required: true }, // Store the establishment ID
      favoritedAt: { type: Date, default: Date.now }, // Timestamp of when it was favorited
    },
  ],
  activityInvites: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ActivityInvite',
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', UserSchema);
