const mongoose = require('mongoose');
const { ReplySchema } = require('./Reply.js');
const { LikeSchema } = require('./Likes.js');

const MediaSchema = new mongoose.Schema({
  photoKey: { type: String, default: null },
  mediaType: {
    type: String,
    default: null,
    validate: {
      validator: function (v) {
        return v === null || ['image', 'video'].includes(v);
      },
      message: props => `${props.value} is not a valid mediaType`,
    },
  },
}, { _id: false });

const CommentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, default: '' }, // no longer required
  likes: [LikeSchema],
  date: { type: Date, default: Date.now },
  replies: [ReplySchema],
  media: MediaSchema,
});

// Custom schema-level validator to require either commentText or media
CommentSchema.pre('validate', function (next) {
  const hasText = this.commentText && this.commentText.trim().length > 0;
  const hasMedia = this.media && this.media.photoKey;

  if (!hasText && !hasMedia) {
    return next(new Error('A comment must have either text or media.'));
  }

  next();
});

const Comment = mongoose.model("Comment", CommentSchema);
module.exports = { Comment, CommentSchema };
