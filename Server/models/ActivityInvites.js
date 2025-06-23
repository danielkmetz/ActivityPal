const mongoose = require('mongoose');
const { CommentSchema } = require('./Comment');
const { LikeSchema } = require('./Likes');

const RequestSchema = new mongoose.Schema({
    userId: { type:mongoose.Schema.Types.ObjectId, ref: 'User'},
    status: {type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending'},
    requestedAt: { type: Date, default: Date.now}
})  

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
