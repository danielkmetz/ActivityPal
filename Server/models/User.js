const mongoose = require('mongoose');
const StorySchema = require('./StorySchema');
const { PhotoSchema } = require('./Photos');

const NotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'followRequest', 
      'followRequestAccepted', 
      'follow',        
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
  typeRef: { type: String, enum: ['User', 'Review', 'Event', 'CheckIn', 'ActivityInvite', 'SharedPost', 'Post' ] }, // Reference model for `relatedId`
  targetId: { type: mongoose.Schema.Types.ObjectId, refPath: 'targetRef' },
  targetRef: { type: String, enum: ['Post', 'Review', 'ActivityInvite', 'CheckIn', 'SharedPost', 'LiveStream', null] },
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
  // 🔁 Follower/Following Structure
  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  following: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  // 🔐 Follow requests (if profile is private)
  followRequests: {
    sent: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    received: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  // ⚙️ Privacy settings
  privacySettings: {
    profileVisibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    invites: {
      type: String,
      enum: ['everyone', 'peopleIFollow', "none"],
      default: 'peopleIFollow',
    },
    contentVisibility: {
      type: String,
      enum: ['public', 'friendsOnly'],
      default: 'public',
    },
    tagPermissions: {
      type: String,
      enum: ['everyone', 'peopleIFollow', "none"],
      default: 'everyone',
    },
    messagePermissions: {
      type: String,
      enum: ['everyone', 'peopleIFollow', "none"],
      default: 'everyone',
    }
  },
  notifications: [NotificationSchema],
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
  recentSearches: [
    {
      queryId: { type: mongoose.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 👈 reference to user
      fullName: { type: String, required: true },
      searchedAt: { type: Date, default: Date.now },
    }
  ],
  stories: [StorySchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', UserSchema);
