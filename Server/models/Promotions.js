const mongoose = require("mongoose");
const { CommentSchema } = require("./Comment.js");
const { LikeSchema } = require("./Likes.js");
const { PhotoSchema } = require("./Photos.js");

const PromotionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, default: null },
  allDay: { type: Boolean, default: true },
  startTime: { type: String, default: null },
  endTime: { type: String, default: null },

  recurring: { type: Boolean, default: false },
  recurringDays: [
    {
      type: String,
      enum: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    },
  ],

  photos: [PhotoSchema],

  placeId: { type: String, required: true },

  likes: [LikeSchema],
  comments: [CommentSchema],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

PromotionSchema.index({ placeId: 1 });
PromotionSchema.index({ placeId: 1, date: 1 });
PromotionSchema.index({ placeId: 1, recurring: 1, recurringDays: 1 });

const Promotion = mongoose.model("Promotion", PromotionSchema);
module.exports = Promotion;
