const mongoose = require("mongoose");
const { LikeSchema } = require('./Likes');

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

const ReplySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true },
  commentText: { type: String, default: '' }, // no longer required
  date: { type: Date, default: Date.now },
  likes: [LikeSchema],
  media: MediaSchema,
});

ReplySchema.add({
  replies: [ReplySchema]
});

// Custom validator: requires either commentText or media
ReplySchema.pre('validate', function (next) {
  const hasText = this.commentText && this.commentText.trim().length > 0;
  const hasMedia = this.media && this.media.photoKey;

  if (!hasText && !hasMedia) {
    return next(new Error('A reply must contain either text or media.'));
  }

  next();
});

const Reply = mongoose.model("Reply", ReplySchema);
module.exports = { Reply, ReplySchema };
