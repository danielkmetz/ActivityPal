const mongoose = require('mongoose');
const { Schema, Types } = mongoose;
const { CommentSchema } = require('./Comment');
const { LikeSchema } = require('./Likes');
const { PhotoSchema } = require('./Photos');

const BasePostSchema = new Schema({
  type: { type: String, enum: ['review','check-in','invite','event','promotion','sharedPost','liveStream'], required: true },

  ownerId:    { type: Types.ObjectId, refPath: 'ownerModel', required: true },
  ownerModel: { type: String, enum: ['User','Business'], default: 'User' },

  // ✅ single field for post text shown in the feed/UI
  message: { type: String, default: '', maxlength: 4000, trim: true },

  placeId: { type: String, index: true, default: null },
  location: { type: { type: String, enum: ['Point'] }, coordinates: [Number] },

  media: [PhotoSchema],
  taggedUsers: [{ type: Types.ObjectId, ref: 'User' }],

  likes: [LikeSchema],
  comments: [CommentSchema],
  stats: {
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
  },

  privacy:    { type: String, enum: ['public','followers','private','unlisted'], default: 'public' },
  visibility: { type: String, enum: ['visible','hidden','deleted'], default: 'visible' },
  deletedAt:  { type: Date },

  sortDate: { type: Date, default: () => new Date(), index: true },
  expireAt: { type: Date },

  shared: {
    originalPostId:     { type: Types.ObjectId, ref: 'Post' },
    originalOwner:      { type: Types.ObjectId, refPath: 'shared.originalOwnerModel' },
    originalOwnerModel: { type: String, enum: ['User','Business'] },
    snapshot:           Schema.Types.Mixed,
  },

  refs: {
    liveStreamId: { type: Types.ObjectId, ref: 'LiveStream', default: null },
  },
}, { timestamps: true, discriminatorKey: 'type' });

BasePostSchema.index({ visibility: 1, sortDate: -1 });
BasePostSchema.index({ ownerId: 1, sortDate: -1 });
BasePostSchema.index({ type: 1, sortDate: -1 });
BasePostSchema.index({ placeId: 1, sortDate: -1 });
BasePostSchema.index({ taggedUsers: 1, sortDate: -1 });
BasePostSchema.index({ location: '2dsphere' });
BasePostSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
// Optional: text search on post text
BasePostSchema.index({ message: 'text' });

const Post = mongoose.model('Post', BasePostSchema);

// --- discriminators (only domain data; no more "caption"/"note" here) ---

const ReviewPost = Post.discriminator('review', new Schema({
  details: {
    rating: { type: Number, min: 1, max: 5, required: true },
    reviewText: { type: String, required: true },   // stays domain-specific
    priceRating: { type: Number, min: 0, max: 4, default: null },
    atmosphereRating: { type: Number, min: 0, max: 5, default: null },
    serviceRating: { type: Number, min: 0, max: 5, default: null },
    wouldRecommend: { type: Boolean, default: null },
    fullName: { type: String },
  },
}));

const CheckInPost = Post.discriminator('check-in', new Schema({
  details: {
    date: { type: Date, default: Date.now },
  },
}));

const InvitePost = Post.discriminator('invite', new Schema({
  details: {
    dateTime: { type: Date, required: true },
    recipients: [{
      userId: { type: Types.ObjectId, ref: 'User', required: true },
      status: { type: String, enum: ['pending','accepted','declined'], default: 'pending' },
    }],
    requests: [{
      userId: { type: Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending','accepted','declined'], default: 'pending' },
      requestedAt: { type: Date, default: Date.now },
    }],
  },
}));

const EventPost = Post.discriminator('event', new Schema({
  details: { startsAt: Date, endsAt: Date, hostId: { type: Types.ObjectId, ref: 'Business' } },
}));

const PromotionPost = Post.discriminator('promotion', new Schema({
  details: { startsAt: Date, endsAt: Date, discountPct: Number, code: String },
}));

const SharedPost = Post.discriminator('sharedPost', new Schema({}));

const LiveStreamPost = Post.discriminator('liveStream', new Schema({
  details: { title: { type: String, default: '' }, status: { type: String, enum: ['idle','live','ended','error'], default: 'idle' }, coverKey: { type: String, default: null }, durationSec: { type: Number }, viewerPeak: { type: Number, default: 0 } },
}));

module.exports = { Post, ReviewPost, CheckInPost, InvitePost, EventPost, PromotionPost, SharedPost, LiveStreamPost };
