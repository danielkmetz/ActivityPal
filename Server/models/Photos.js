const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
  photoKey: { type: String, required: true }, // Unique identifier for the photo (e.g., S3 key)
  uploadedBy: { type: String, required: true }, // User who uploaded the photo
  description: { type: String, default: null }, // Optional description for the photo
  taggedUsers: [
    {
      userId: { type: String, required: true }, // Store user ID reference
      x: { type: Number, required: true }, // X coordinate of tag
      y: { type: Number, required: true }, // Y coordinate of tag
    },
  ], // Tagged users with coordinates
  uploadDate: { type: Date, default: Date.now }, // Date the photo was uploaded
});

const Photo = mongoose.model("Photo", PhotoSchema);
module.exports = { Photo, PhotoSchema };