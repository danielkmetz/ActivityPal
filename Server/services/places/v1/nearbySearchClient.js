const axios = require("axios");

function roundCoord(n) {
  return typeof n === "number" ? Math.round(n * 10000) / 10000 : n;
}

function safeName(s) {
  const t = String(s || "").trim();
  return t.length > 60 ? t.slice(0, 57) + "..." : t;
}

const DEFAULT_FIELD_MASK = [
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
].join(",");

async function fetchNearbyPlacesV1({
  apiKey,
  lat,
  lng,
  radiusMeters,
  type,
  excludedTypes = [],
  fieldMask = DEFAULT_FIELD_MASK,
  timeoutMs = 15000,
  log = null,
}) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const body = {
    includedTypes: [type],
    excludedTypes,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Number(radiusMeters),
      },
    },
  };

  log?.(`[${reqId}] request`, {
    type,
    excludedCount: excludedTypes.length,
    radiusMeters: body.locationRestriction.circle.radius,
    lat: roundCoord(lat),
    lng: roundCoord(lng),
  });

  try {
    const response = await axios.post("https://places.googleapis.com/v1/places:searchNearby", body, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      timeout: timeoutMs,
    });

    const places = response?.data?.places || [];

    if (log) {
      const sample = places.slice(0, 3).map((p) => ({
        id: p?.id,
        name: safeName(p?.displayName?.text),
        primaryType: p?.primaryType || null,
        openNow:
          typeof p?.currentOpeningHours?.openNow === "boolean" ? p.currentOpeningHours.openNow : null,
      }));

      log?.(`[${reqId}] response`, { count: places.length, sample });
    }

    return places;
  } catch (err) {
    log?.(`[${reqId}] ERROR`, {
      status: err?.response?.status,
      message: err?.message,
      data: err?.response?.data,
    });
    throw err;
  }
}

module.exports = { fetchNearbyPlacesV1, DEFAULT_FIELD_MASK };
