const axios = require("axios");
const util = require("util");
const { buildPlacesFieldMask } = require("../google/fieldMask");

const GOOGLE_DEBUG_ENV = true;

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

function normalizeErr(err) {
  const status = err?.response?.status ?? null;
  const data = err?.response?.data ?? null;
  const googleMsg = data?.error?.message || data?.message || err?.message || "Unknown error";
  return {
    status,
    message: googleMsg,
    googleStatus: data?.error?.status || null,
    details: data?.error?.details || null,
  };
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function roundNum(n, d = 3) {
  const x = Number(n);
  if (!Number.isFinite(x)) return n;
  const p = Math.pow(10, d);
  return Math.round(x * p) / p;
}

function inspectSafe(obj) {
  return util.inspect(obj, { depth: 6, colors: false, maxArrayLength: 50, breakLength: 120 });
}

function makeGoogleLogger({ debug, reqId }) {
  const enabled = !!debug || GOOGLE_DEBUG_ENV;
  if (!enabled) return null;

  const id = reqId ? String(reqId) : "no-reqid";
  return {
    info: (msg, obj) => {
      if (obj === undefined) console.log(`[places2][${id}][google] ${msg}`);
      else console.log(`[places2][${id}][google] ${msg}`, obj);
    },
    warn: (msg, obj) => {
      if (obj === undefined) console.warn(`[places2][${id}][google] ${msg}`);
      else console.warn(`[places2][${id}][google] ${msg}`, obj);
    },
    error: (msg, obj) => {
      if (obj === undefined) console.error(`[places2][${id}][google] ${msg}`);
      else console.error(`[places2][${id}][google] ${msg}`, obj);
    },
  };
}

async function fetchNearbyPlacesV1({
  apiKey,
  lat,
  lng,
  radiusMeters,
  includedTypes, // REQUIRED: string[]
  excludedTypes = [],
  maxResultCount = 20,
  rankPreference = null,
  includeCurrentOpeningHours,
  when,
  who,
  includeWhoFields,
  fieldMask,
  timeoutMs = 15000,

  // ---- DEBUG OPTIONS ----
  debug = false, // or set env PLACES2_GOOGLE_DEBUG=1
  reqId = null,  // pass through from route/engine so logs correlate
} = {}) {
  const log = makeGoogleLogger({ debug, reqId });

  const typesArr = Array.isArray(includedTypes)
    ? includedTypes.map(String).map((s) => s.trim()).filter(Boolean)
    : [];

  if (!typesArr.length) {
    log?.error("invalid input: includedTypes empty", { includedTypes });
    throw new Error("fetchNearbyPlacesV1 requires includedTypes: string[] (non-empty)");
  }

  const latNum = toNumberOrNull(lat);
  const lngNum = toNumberOrNull(lng);
  const rNum = toNumberOrNull(radiusMeters);

  if (latNum == null || lngNum == null) {
    log?.error("invalid input: lat/lng not numeric", { lat, lng });
    throw new Error("fetchNearbyPlacesV1 requires numeric lat/lng");
  }
  if (rNum == null || rNum <= 0) {
    log?.error("invalid input: radiusMeters invalid", { radiusMeters });
    throw new Error("fetchNearbyPlacesV1 requires numeric radiusMeters > 0");
  }

  const body = {
    maxResultCount: clampMaxResultCount(maxResultCount, 20),
    locationRestriction: {
      circle: {
        center: { latitude: latNum, longitude: lngNum },
        radius: rNum,
      },
    },
    includedTypes: typesArr,
    excludedTypes: Array.isArray(excludedTypes) ? excludedTypes : [],
  };

  const rp = normalizeRankPreference(rankPreference);
  if (rp) body.rankPreference = rp;

  const wantCurrentOpeningHours =
    typeof includeCurrentOpeningHours === "boolean"
      ? includeCurrentOpeningHours
      : String(when || "").toLowerCase() === "now";

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

  const url = "https://places.googleapis.com/v1/places:searchNearby";

  // ---- REQUEST LOG (no key leak) ----
  log?.info("request", {
    url,
    timeoutMs,
    apiKeyLen: typeof apiKey === "string" ? apiKey.length : null,
    lat: roundNum(latNum, 3),
    lng: roundNum(lngNum, 3),
    radiusMeters: Math.round(rNum),
    maxResultCount: body.maxResultCount,
    rankPreference: body.rankPreference || null,
    includedTypes: typesArr.slice(0, 25),
    includedTypesTruncated: typesArr.length > 25,
    excludedTypesCount: Array.isArray(body.excludedTypes) ? body.excludedTypes.length : 0,
    excludedTypesPreview: Array.isArray(body.excludedTypes) ? body.excludedTypes.slice(0, 15) : [],
    fieldMaskLen: typeof effectiveFieldMask === "string" ? effectiveFieldMask.length : null,
    fieldMaskPreview:
      typeof effectiveFieldMask === "string"
        ? effectiveFieldMask.slice(0, 120) + (effectiveFieldMask.length > 120 ? "…" : "")
        : null,
  });

  const t0 = Date.now();

  try {
    const response = await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": effectiveFieldMask,
      },
      timeout: timeoutMs,
      validateStatus: () => true,
    });

    const ms = Date.now() - t0;

    // ---- RESPONSE LOG ----
    const data = response?.data || {};
    const places = Array.isArray(data.places) ? data.places : [];
    log?.info("response", {
      status: response.status,
      ms,
      placesLen: places.length,
      sample: places.slice(0, 3).map((p) => ({
        id: p?.id || null,
        displayName: p?.displayName?.text || p?.displayName || null,
      })),
      dataKeys: data && typeof data === "object" ? Object.keys(data).slice(0, 25) : null,
    });

    if (!(response.status >= 200 && response.status < 300)) {
      // This is the payload you actually need.
      log?.warn("non-2xx from google", {
        status: response.status,
        ms,
        errorPayload: inspectSafe(data),
      });

      const msg = data?.error?.message || data?.message || `HTTP ${response.status}`;
      const err = new Error(msg);
      err.response = response;
      err.normalized = normalizeErr(err);
      throw err;
    }

    return { places };
  } catch (err) {
    const ms = Date.now() - t0;

    // Axios/network/timeouts land here too.
    const norm = err?.normalized || normalizeErr(err);
    log?.error("request failed", {
      ms,
      message: err?.message,
      normalized: norm,
      // if google responded, print the payload too
      googlePayload: err?.response?.data ? inspectSafe(err.response.data) : null,
    });

    if (!err.normalized) err.normalized = norm;
    throw err;
  }
}

module.exports = {
  fetchNearbyPlacesV1,
};
