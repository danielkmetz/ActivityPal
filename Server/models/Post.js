const mongoose = require('mongoose');
const { Schema, Types } = mongoose;
const { CommentSchema } = require('./Comment');
const { LikeSchema } = require('./Likes');
const { PhotoSchema } = require('./Photos');
const { GeoPointSchema } = require('./GeoPoint');
const { User } = require('../models/User');

const BasePostSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'review',
        'check-in',
        'invite',
        'event',
        'promotion',
        'sharedPost',
        'liveStream',
      ],
      required: true,
    },

    ownerId: { type: Types.ObjectId, refPath: 'ownerModel', required: true },
    ownerModel: { type: String, enum: ['User', 'Business'], default: 'User' },

    // unified text for feed
    message: { type: String, default: '', maxlength: 4000, trim: true },

    businessName: { type: String, default: null },
    placeId: { type: String, index: true, default: null },
    location: { type: GeoPointSchema, default: undefined },

    media: [PhotoSchema],
    taggedUsers: [{ type: Types.ObjectId, ref: 'User' }],

    likes: [LikeSchema],
    comments: [CommentSchema],
    stats: {
      likeCount: { type: Number, default: 0 },
      commentCount: { type: Number, default: 0 },
      shareCount: { type: Number, default: 0 },
    },

    privacy: {
      type: String,
      enum: ['public', 'followers', 'private', 'unlisted'],
      default: 'public',
    },
    visibility: {
      type: String,
      enum: ['visible', 'hidden', 'deleted'],
      default: 'visible',
    },
    deletedAt: { type: Date },

    sortDate: { type: Date, default: () => new Date(), index: true },
    expireAt: { type: Date },

    shared: {
      originalPostId: { type: Types.ObjectId, ref: 'Post' },
      originalOwner: { type: Types.ObjectId, refPath: 'shared.originalOwnerModel' },
      originalOwnerModel: { type: String, enum: ['User', 'Business'] },
      snapshot: Schema.Types.Mixed,
    },

    refs: {
      liveStreamId: { type: Types.ObjectId, ref: 'LiveStream', default: null },
      relatedInviteId: { type: Types.ObjectId, ref: 'Post', default: null },
    },
  },
  { timestamps: true, discriminatorKey: 'type' }
);

BasePostSchema.path('createdAt').immutable(true);
BasePostSchema.index({ visibility: 1, sortDate: -1 });
BasePostSchema.index({ ownerId: 1, sortDate: -1 });
BasePostSchema.index({ type: 1, sortDate: -1 });
BasePostSchema.index({ placeId: 1, sortDate: -1 });
BasePostSchema.index({ taggedUsers: 1, sortDate: -1 });
BasePostSchema.index({ location: '2dsphere' });
BasePostSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
BasePostSchema.index({ message: 'text' });
BasePostSchema.index({ 'refs.relatedInviteId': 1, ownerId: 1, type: 1 });

const Post = mongoose.model('Post', BasePostSchema);

// ------------------------- REVIEW DISCRIMINATOR -------------------------

const ReviewPost = Post.discriminator(
  'review',
  new Schema(
    {
      details: {
        // core recap
        rating: { type: Number, min: 1, max: 5, required: true },

        // new required "would go back" field (yes/no)
        wouldGoBack: {
          type: Boolean,
          required: true,
        },

        // optional text; rating-only reviews must be allowed
        reviewText: {
          type: String,
          default: '',
          maxlength: 4000,
          trim: true,
        },

        // optional price rating (0–4, where 0 = not set/unknown)
        priceRating: {
          type: Number,
          min: 0,
          max: 4,
          default: null,
        },

        // up to 3 vibe tags like ['chill', 'loud', 'romantic']
        vibeTags: {
          type: [String],
          default: [],
          validate: {
            validator: function (arr) {
              if (!Array.isArray(arr)) return false;
              return arr.length <= 3;
            },
            message: 'vibeTags can contain at most 3 items',
          },
        },

        // cached display name (optional)
        fullName: { type: String },

        // legacy fields kept for backward compatibility (hidden by default)
        atmosphereRating: {
          type: Number,
          min: 0,
          max: 5,
          default: null,
          select: false,
        },
        serviceRating: {
          type: Number,
          min: 0,
          max: 5,
          default: null,
          select: false,
        },
        wouldRecommend: {
          type: Boolean,
          default: null,
          select: false,
        },
      },
    },
    { _id: false }
  )
);

// ------------------------ OTHER DISCRIMINATORS --------------------------

const CheckInPost = Post.discriminator(
  'check-in',
  new Schema(
    {
      details: {
        date: { type: Date, default: Date.now },
      },
    },
    { _id: false }
  )
);

const InvitePost = Post.discriminator(
  'invite',
  new Schema(
    {
      details: {
        dateTime: { type: Date, required: true },
        timeZone: { type: String, default: 'America/Chicago' },
        recipients: [
          {
            userId: { type: Types.ObjectId, ref: 'User', required: true },
            status: {
              type: String,
              enum: ['pending', 'accepted', 'declined'],
              default: 'pending',
            },
            nudgedAt: { type: Date, default: null },
          },
        ],
        went: {
          type: String,
          enum: ['unknown', 'went', 'did_not_go'],
          default: 'unknown',
        },
        requests: [
          {
            userId: { type: Types.ObjectId, ref: 'User' },
            status: {
              type: String,
              enum: ['pending', 'accepted', 'declined'],
              default: 'pending',
            },
            requestedAt: { type: Date, default: Date.now },
          },
        ],
        recapReminderSentAt: { type: Date, default: null },
      },
    },
    { _id: false }
  )
);

const EventPost = Post.discriminator(
  'event',
  new Schema(
    {
      details: {
        startsAt: Date,
        endsAt: Date,
        hostId: { type: Types.ObjectId, ref: 'Business' },
      },
    },
    { _id: false }
  )
);

const PromotionPost = Post.discriminator(
  'promotion',
  new Schema(
    {
      details: {
        startsAt: Date,
        endsAt: Date,
        discountPct: Number,
        code: String,
      },
    },
    { _id: false }
  )
);

const SharedPost = Post.discriminator('sharedPost', new Schema({}));

module.exports = {
  Post,
  ReviewPost,
  CheckInPost,
  InvitePost,
  EventPost,
  PromotionPost,
  SharedPost,
};
