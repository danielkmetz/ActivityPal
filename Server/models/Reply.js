const mongoose = require("mongoose");
const { LikeSchema } = require('./Likes');

const ReplySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  likes: [ LikeSchema ],
});

ReplySchema.add({
  replies: [ReplySchema]
});

// Register the model
const Reply = mongoose.model("Reply", ReplySchema);
module.exports = { Reply, ReplySchema };
