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

const CheckIn = mongoose.model('CheckIn', CheckInSchema);
module.exports = CheckIn;
