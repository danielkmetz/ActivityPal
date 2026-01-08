const mongoose = require('mongoose');
const { Schema } = mongoose;
const { GeoPointSchema } = require('./GeoPoint');

const VenueSchema = new Schema(
  {
    kind: { type: String, enum: ['place', 'custom'], required: true },

    // what you display in UI (“Starbucks”, “Dan’s House”, “Trailhead”)
    label: { type: String, required: true, trim: true, maxlength: 80 },

    // place-only
    placeId: { type: String, default: null },

    // custom-only (treat as sensitive; do NOT use for public discovery)
    address: { type: String, default: null, trim: true, maxlength: 200 },
    geo: { type: GeoPointSchema, default: undefined },
  },
  { _id: false }
);

module.exports = { VenueSchema };
