const mongoose = require('mongoose');
const { Schema } = mongoose;

const GeoPointSchema = new Schema({
  type: { type: String, enum: ['Point'] },
  coordinates: {
    type: [Number],
    default: undefined,                 // <-- do NOT default to []
    validate: {
      // Only validate when coordinates are actually provided
      validator: function (v) {
        if (v == null) return true;     // allow location to be completely absent
        return Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
      },
      message: 'location.coordinates must be [lng, lat]',
    },
  },
  formattedAddress: { type: String, default: null },
}, { _id: false });

const GeoPoint = mongoose.model('GeoPoint', GeoPointSchema);
module.exports = { GeoPoint, GeoPointSchema } 