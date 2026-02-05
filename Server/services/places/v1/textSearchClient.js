const axios = require("axios");
const { buildPlacesFieldMask } = require("../google/fieldMask");

function clampMaxResultCount(n, fallback = 20) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(20, Math.max(1, Math.floor(x)));
}

/**
 * Places API v1: text search (places:searchText)
 */
async function fetchPlacesTextV1({
  apiKey,
  textQuery,
  lat,
  lng,
  radiusMeters,

  includedType = null,         // Places v1 searchText uses includedType (singular)
  strictTypeFiltering = false,
  maxResultCount = 20,

  // Parity with nearby client
  when,                        // "now" | "tonight" | "tomorrow" | "weekend" | "custom" | etc
  who,                         // "solo" | "date" | "friends" | "family" | null
  includeCurrentOpeningHours,  // boolean | undefined
  includeWhoFields,            // boolean | undefined

  fieldMask,                   // optional override
  timeoutMs = 15000,
} = {}) {
  const tq = String(textQuery || "").trim();
  if (!tq) return [];

  const body = {
    textQuery: tq,
    maxResultCount: clampMaxResultCount(maxResultCount, 20),
    locationRestriction: {
      circle: {
        center: { latitude: Number(lat), longitude: Number(lng) },
        radius: Number(radiusMeters),
      },
    },
    ...(includedType ? { includedType: String(includedType) } : {}),
    ...(strictTypeFiltering ? { strictTypeFiltering: true } : {}),
  };

  // Only request currentOpeningHours when it matters (When=now UX)
  const wantCurrentOpeningHours =
    typeof includeCurrentOpeningHours === "boolean"
      ? includeCurrentOpeningHours
      : String(when || "").toLowerCase() === "now";

  // Only request Who fields when we’re actually using who scoring/guardrails
  const wantWhoFields =
    typeof includeWhoFields === "boolean"
      ? includeWhoFields
      : !!who;

  const effectiveFieldMask =
    fieldMask ||
    buildPlacesFieldMask({
      includeCurrentOpeningHours: wantCurrentOpeningHours,
      includeWhoFields: wantWhoFields,
    });

  const resp = await axios.post(
    "https://places.googleapis.com/v1/places:searchText",
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

  return Array.isArray(resp?.data?.places) ? resp.data.places : [];
}

module.exports = {
  fetchPlacesTextV1,
};
