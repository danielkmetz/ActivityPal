const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  replies: [this], // Self-referencing replies for recursive nesting
});

module.exports = mongoose.model('Comment', CommentSchema);