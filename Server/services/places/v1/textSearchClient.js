const axios = require("axios");

const DEFAULT_TEXT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.types",
  "places.primaryType",
  "places.location",
  "places.shortFormattedAddress",
  "places.photos",
  "places.priceLevel",
  "places.allowsDogs",
  "places.currentOpeningHours",
  "places.regularOpeningHours",
  "places.rating",
  "places.userRatingCount",
].join(",");

function clampMaxResultCount(n, fallback = 20) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(20, Math.max(1, Math.floor(x)));
}

async function fetchPlacesTextV1({
  apiKey,
  textQuery,
  lat,
  lng,
  radiusMeters,
  includedType = null,      // Text Search uses includedType (singular) :contentReference[oaicite:2]{index=2}
  strictTypeFiltering = false,
  maxResultCount = 20,
  fieldMask = DEFAULT_TEXT_FIELD_MASK,
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

  const resp = await axios.post(
    "https://places.googleapis.com/v1/places:searchText",
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      timeout: timeoutMs,
      validateStatus: (s) => s >= 200 && s < 300,
    }
  );

  return Array.isArray(resp?.data?.places) ? resp.data.places : [];
}

module.exports = { fetchPlacesTextV1, DEFAULT_TEXT_FIELD_MASK };
