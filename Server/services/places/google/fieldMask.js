function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of Array.isArray(arr) ? arr : []) {
    if (!x || typeof x !== "string") continue;
    const v = x.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function joinMask(fields) {
  return uniq(fields).join(",");
}

// -----------------------
// Base fields (always useful)
// -----------------------
const BASE_PLACE_FIELDS = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.primaryType",
  "places.location",
  "places.shortFormattedAddress",
  "places.photos",
  "places.priceLevel",
  "places.rating",
  "places.userRatingCount",

  // "Open at target time" evaluation support
  "places.regularOpeningHours",
  "places.utcOffsetMinutes",
  "places.timeZone",

  // Used by your filters/scoring
  "places.allowsDogs",
];

// Only needed for When="now" UX + open-now badge behavior
const NOW_FIELDS = [
  "places.currentOpeningHours",
];

// Fields that power your Who scoring + guardrails
// NOTE: Not all places will have these, but requesting them is required for any chance of signal.
const WHO_FIELDS = [
  "places.goodForChildren",
  "places.goodForGroups",
  "places.goodForWatchingSports",
  "places.outdoorSeating",
  "places.liveMusic",
  "places.reservable",
  "places.menuForChildren",
];

// -----------------------
// Public builders
// -----------------------

/**
 * Build a Places API v1 field mask string for endpoints that return `places`.
 *
 * @param {Object} opts
 * @param {boolean} opts.includeCurrentOpeningHours - include `places.currentOpeningHours`
 * @param {boolean} opts.includeWhoFields - include Who attribute fields
 * @param {string[]|null} opts.extraFields - optional additive fields
 * @param {string[]|null} opts.baseOverride - optional replace base fields entirely (rare)
 */
function buildPlacesFieldMask({
  includeCurrentOpeningHours = false,
  includeWhoFields = false,
  extraFields = null,
  baseOverride = null,
} = {}) {
  const base = Array.isArray(baseOverride) && baseOverride.length
    ? baseOverride
    : BASE_PLACE_FIELDS;

  const fields = [...base];

  if (includeWhoFields) fields.push(...WHO_FIELDS);
  if (includeCurrentOpeningHours) fields.push(...NOW_FIELDS);

  if (Array.isArray(extraFields) && extraFields.length) {
    fields.push(...extraFields);
  }

  return joinMask(fields);
}

// -----------------------
// Exports
// -----------------------
module.exports = {
  // constants
  BASE_PLACE_FIELDS,
  NOW_FIELDS,
  WHO_FIELDS,

  // builders
  buildPlacesFieldMask,
};
