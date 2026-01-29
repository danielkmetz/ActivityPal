const axios = require("axios");

// ---- Field masks ----
// You need: regularOpeningHours (periods) + timezone/offset so you can evaluate "open at target time".
const BASE_FIELD_MASK_FIELDS = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.primaryType",
  "places.location",
  "places.shortFormattedAddress",
  "places.photos",
  "places.priceLevel",
  "places.allowsDogs",
  "places.regularOpeningHours",  // contains periods/weekdayDescriptions
  "places.rating",
  "places.userRatingCount",

  // For correct "targetAt" evaluation, especially near timezone boundaries
  "places.utcOffsetMinutes",
  "places.timeZone",
].join(",");

// Only useful for "When = now" UX + openNowOnly filter
const NOW_FIELD_MASK_FIELDS = ["places.currentOpeningHours"].join(",");

function buildNearbyFieldMask({ includeCurrentOpeningHours = true } = {}) {
  return includeCurrentOpeningHours
    ? `${BASE_FIELD_MASK_FIELDS},${NOW_FIELD_MASK_FIELDS}`
    : BASE_FIELD_MASK_FIELDS;
}

function normalizeRankPreference(v) {
  const s = String(v || "").toUpperCase().trim();
  if (s === "DISTANCE" || s === "POPULARITY") return s;
  return null;
}

function clampMaxResultCount(n, fallback = 20) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(20, Math.max(1, Math.floor(x)));
}

/**
 * Places API (New): nearby search (one-shot, no page tokens like legacy).
 */
async function fetchNearbyPlacesV1({
  apiKey,
  lat,
  lng,
  radiusMeters,

  // Back-compat: allow either `type` or `includedTypes`
  type,
  includedTypes,

  excludedTypes = [],
  maxResultCount = 20,
  rankPreference = null,

  // NEW: let caller control whether currentOpeningHours is fetched
  includeCurrentOpeningHours, // boolean | undefined
  when, // optional string (e.g., "now", "tonight", "custom") to infer includeCurrentOpeningHours

  fieldMask, // optional override
  timeoutMs = 15000,
} = {}) {
  const typesArr = Array.isArray(includedTypes)
    ? includedTypes.filter(Boolean)
    : type
      ? [type]
      : [];

  const body = {
    maxResultCount: clampMaxResultCount(maxResultCount, 20),
    locationRestriction: {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: Number(radiusMeters),
      },
    },
    ...(typesArr.length ? { includedTypes: typesArr } : {}),
    excludedTypes: Array.isArray(excludedTypes) ? excludedTypes : [],
  };

  const rp = normalizeRankPreference(rankPreference);
  if (rp) body.rankPreference = rp;

  // Decide if we should request currentOpeningHours.
  // Only really needed for "When = now" features (openNowOnly, badges).
  const includeCurrent =
    typeof includeCurrentOpeningHours === "boolean"
      ? includeCurrentOpeningHours
      : String(when || "").toLowerCase() === "now";

  const effectiveFieldMask = fieldMask || buildNearbyFieldMask({
    includeCurrentOpeningHours: includeCurrent,
  });

  const response = await axios.post(
    "https://places.googleapis.com/v1/places:searchNearby",
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": effectiveFieldMask,
      },
      timeout: timeoutMs,
      validateStatus: (s) => s >= 200 && s < 300,
    }
  );

  const data = response?.data;
  return Array.isArray(data?.places) ? data.places : [];
}

module.exports = {
  fetchNearbyPlacesV1,
  buildNearbyFieldMask,
  BASE_FIELD_MASK_FIELDS,
};
