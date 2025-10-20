const mongoose = require('mongoose');
const { CommentSchema } = require('./Comment.js');
const { LikeSchema } = require('./Likes.js');
const { PhotoSchema } = require('./Photos.js');

const CheckInSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  placeId: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  message: {
    type: String,
    maxlength: 500
  },
  photos: [PhotoSchema],
  taggedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  likes: [LikeSchema],
  comments: [CommentSchema]
}, { timestamps: true }); // adds createdAt and updatedAt

// Author profile feed (check-ins by user, newest first + cursor by _id)
CheckInSchema.index({ userId: 1, date: -1, _id: -1 });

// Business/place page (check-ins by place, newest first + cursor by _id)
CheckInSchema.index({ placeId: 1, date: -1, _id: -1 });

// “Tagged” tab — post-level tags (ObjectId[]), newest first + cursor by _id
CheckInSchema.index({ taggedUsers: 1, date: -1, _id: -1 });

// “Tagged” tab — photo-level tags (stored as string userId), newest first + cursor by _id
CheckInSchema.index({ 'photos.taggedUsers.userId': 1, date: -1, _id: -1 });

// Optional: global recent check-ins (if you ever list all by recency)
CheckInSchema.index({ date: -1, _id: -1 });

const CheckIn = mongoose.model('CheckIn', CheckInSchema);
module.exports = CheckIn;
