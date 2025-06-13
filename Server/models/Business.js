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

const ReplySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  replies: [this],
});

// Define a recursive CommentSchema
const CommentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  replies: [ReplySchema], // Self-referencing replies for recursive nesting
});

const ReviewSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 }, // overall
  reviewText: { type: String, required: true },
  photos: [PhotoSchema],
  date: { type: Date, default: Date.now },
  priceRating: { type: Number, min: 0, max: 4, default: null },          // $, $$, $$$, $$$$
  atmosphereRating: { type: Number, min: 0, max: 5, default: null },    // emoji slider
  serviceRating: { type: Number, min: 0, max: 5, default: null },       // Likert slider
  wouldRecommend: { type: Boolean, default: null },                    // Yes/No toggle
  likes: [
    {
      userId: { type: String, required: true },
      fullName: { type: String, required: true },
      date: { type: Date, default: Date.now },
    },
  ],
  comments: [CommentSchema],
  taggedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
});

const PromotionSchema = new mongoose.Schema({
  title: { type: String, required: true }, // Promotion title
  description: { type: String, required: true }, // Promotion details

  // Start/end date used for single-day OR date range
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },

  // Optional time range (null = all day)
  allDay: { type: Boolean, default: true },
  startTime: { type: String, default: null }, // e.g., "17:00"
  endTime: { type: String, default: null },   // e.g., "19:00"

  isSingleDay: { type: Boolean, default: true },

  recurring: { type: Boolean, default: false },
  recurringDays: [{
    type: String,
    enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  }],

  photos: [PhotoSchema], // Image key (optional)
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true }, // Promotion title
  description: { type: String, required: true }, // Promotion details
  date: { type: Date, default: null }, // Promotion start date
  photos: [PhotoSchema], // Image key (optional)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  recurring: { type: Boolean, default: false },
  recurringDays: [{ type: String, enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] }],
  allDay: { type: Boolean, default: true },
  startTime: { type: String, default: null },
  endTime: { type: String, default: null },
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
  typeRef: { type: String, enum: ['User', 'Review', 'Event', 'CheckIn', 'ActivityInvite'] }, // Reference model for `relatedId`
  targetId: { type: mongoose.Schema.Types.ObjectId, refPath: 'targetRef' },
  targetRef: { type: String, enum: ['Review', 'ActivityInvite', null] },
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
  promotions: [PromotionSchema],
  events: [EventSchema],
  reviews: [ReviewSchema],
  photos: [PhotoSchema],
  notifications: [NotificationSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

BusinessSchema.index({ location: "2dsphere" });

module.exports = mongoose.model('Business', BusinessSchema);
