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

const ReviewSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  reviewText: { type: String, required: true },
  photos: [PhotoSchema],
  date: { type: Date, default: Date.now },
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
      ref: "User", // References User model to tag friends
    },
  ],
});

const PromotionSchema = new mongoose.Schema({
  title: { type: String, required: true }, // Promotion title
  description: { type: String, required: true }, // Promotion details
  startDate: { type: Date, required: true }, // Promotion start date
  endDate: { type: Date, required: true }, // Promotion end date
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" }, // Business reference
  photos: [PhotoSchema], // Image key (optional)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  recurring: { type: Boolean, default: false },
  recurringDays: [{ type: String, enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] }],
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
    type: String,
    required: true,
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Business', BusinessSchema);
