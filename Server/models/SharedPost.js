const mongoose = require('mongoose');
const { CommentSchema } = require('./Comment');
const { LikeSchema } = require('./Likes');

const SharedPostSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who shared
  originalOwner: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  originalOwnerModel: {
    type: String,
    required: true,
    enum: ['User', 'Business'],
  },
  postType: {
    type: String,
    enum: ['review', 'check-in', 'invite', 'promotion', 'event'],
    required: true
  },
  originalPostId: { type: mongoose.Schema.Types.ObjectId, required: true },
  caption: { type: String, default: '' },
  comments: [CommentSchema],
  likes: [LikeSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SharedPost', SharedPostSchema);
