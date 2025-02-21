const mongoose = require("mongoose");

const ReplySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Reply" }], // Self-referencing for recursive replies
});

// Register the model
const Reply = mongoose.model("Reply", ReplySchema);
module.exports = Reply;
