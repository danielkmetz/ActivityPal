const mongoose = require('mongoose');
const { CommentSchema } = require('./Comment.js');
const { LikeSchema } = require('./Likes.js');
const { PhotoSchema } = require('./Photos.js'); // Or define inline if needed

const ReviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  placeId: {
    type: String,
    required: true
  },
  fullName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  reviewText: { type: String, required: true },
  photos: [PhotoSchema],
  date: { type: Date, default: Date.now },
  priceRating: { type: Number, min: 0, max: 4, default: null },
  atmosphereRating: { type: Number, min: 0, max: 5, default: null },
  serviceRating: { type: Number, min: 0, max: 5, default: null },
  wouldRecommend: { type: Boolean, default: null },
  likes: [LikeSchema],
  comments: [CommentSchema],
  taggedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
});

// Author profile feed (reviews by user, newest first + cursor by _id)
ReviewSchema.index({ userId: 1, date: -1, _id: -1 });

// Business page (reviews by place, newest first + cursor by _id)
ReviewSchema.index({ placeId: 1, date: -1, _id: -1 });

// “Tagged” tab — post-level tags (ObjectId[]), newest first + cursor by _id
ReviewSchema.index({ taggedUsers: 1, date: -1, _id: -1 });

// “Tagged” tab — photo-level tags (stored as string userId), newest first + cursor by _id
ReviewSchema.index({ 'photos.taggedUsers.userId': 1, date: -1, _id: -1 });

// Optional: global recent reviews (if you ever list all reviews by recency)
ReviewSchema.index({ date: -1, _id: -1 });


module.exports = mongoose.model('Review', ReviewSchema);
