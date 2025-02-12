const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
  photoKey: { type: String, required: true }, // Unique identifier for the photo (e.g., S3 key)
  uploadedBy: { type: String, required: true }, // Email of the user who uploaded the photo
  description: { type: String, default: null }, // Optional description for the photo
  tags: [{ type: String }], // Optional tags for categorizing the photo
  uploadDate: { type: Date, default: Date.now }, // Date the photo was uploaded
});

const ReplySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  replies: [
    {
      type: new mongoose.Schema(
        {
          userId: { type: String, required: true },
          fullName: { type: String, required: true },
          commentText: { type: String, required: true },
          date: { type: Date, default: Date.now },
          replies: [], // Allow deeply nested replies
        },
        { _id: true } // Ensure `_id` is generated for each reply
      ),
    },
  ],
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
  events: [
    {
      title: { type: String, required: true },
      date: { type: Date, required: true },
      description: { type: String, required: true },
    },
  ],
  reviews: [ReviewSchema],
  photos: [PhotoSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Business', BusinessSchema);
