const mongoose = require('mongoose');

// Recursive reply schema
const ReplySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  replies: [this] // You can define this recursively later if deep nesting is needed
});

// Comment schema
const CommentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, required: true },
  date: { type: Date, default: Date.now },
  replies: [ReplySchema]
});

const RequestSchema = new mongoose.Schema({
    userId: { type:mongoose.Schema.Types.ObjectId, ref: 'User'},
    status: {type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending'},
    requestedAt: { type: Date, default: Date.now}
})  

// Like schema
const LikeSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  fullName: { type: String, required: true },
});

// Activity Invite schema with social features
const ActivityInviteSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipients: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending',
      },
    },
  ],
  placeId: { type: String, required: true },
  note: { type: String, default: null },
  dateTime: { type: Date, required: true },
  message: { type: String, default: '' },
  isPublic: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'sent'],
    default: 'pending',
  },
  likes: [LikeSchema],
  comments: [CommentSchema],
  requests: [RequestSchema],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ActivityInvite', ActivityInviteSchema);
