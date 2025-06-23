const mongoose = require('mongoose');
const { ReplySchema } = require('./Reply.js');
const { LikeSchema } = require('./Likes.js');

const CommentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  likes: [LikeSchema],
  date: { type: Date, default: Date.now },
  replies: [ReplySchema], // Self-referencing replies for recursive nesting
});

const Comment = mongoose.model("Comment", CommentSchema);
module.exports = { Comment, CommentSchema };