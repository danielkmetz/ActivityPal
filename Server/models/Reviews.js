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

module.exports = mongoose.model('Review', ReviewSchema);
