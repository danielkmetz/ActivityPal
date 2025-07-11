const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, default: null }, // optional if you can populate
  date: { type: Date, default: Date.now },
});

// ✅ Export both the model AND the schema
const Like = mongoose.model("Like", LikeSchema);
module.exports = { Like, LikeSchema };