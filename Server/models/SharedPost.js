const mongoose = require('mongoose');
const { CommentSchema } = require('./Comment');

const SharedPostSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who shared
  originalOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // original creator
  postType: {
    type: String,
    enum: ['review', 'checkin', 'invite', 'promotion', 'event'],
    required: true
  },
  originalPostId: { type: mongoose.Schema.Types.ObjectId, required: true },
  caption: { type: String, default: '' },
  comments: [CommentSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SharedPost', SharedPostSchema);
