const axios = require("axios");

const GOOGLE_KEY = process.env.GOOGLE_KEY;

const THUMB_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const cache = new Map();      // placeId -> { url: string|null, ts: number }
const inFlight = new Map();   // placeId -> Promise<string|null>

function normalizeBase(baseUrl) {
  const b = String(baseUrl || "").trim();
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

function getCached(placeId) {
  const entry = cache.get(placeId);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > THUMB_TTL_MS) {
    cache.delete(placeId);
    return undefined;
  }
  return entry.url; // can be null
}

function setCached(placeId, url) {
  cache.set(placeId, { url: url ?? null, ts: Date.now() });
}

async function fetchPhotoRef(placeId) {
  const detailsUrl = "https://maps.googleapis.com/maps/api/place/details/json";

  const r = await axios.get(detailsUrl, {
    params: { place_id: placeId, fields: "photos", key: GOOGLE_KEY },
    timeout: 12000,
    validateStatus: () => true,
  });

  // Google often returns 200 with body.status != OK
  if (r.status >= 400) return null;
  if (r.data?.status !== "OK") return null;

  return r.data?.result?.photos?.[0]?.photo_reference || null;
}

async function getThumbnailUrl(placeId, baseUrl) {
  if (!placeId || !GOOGLE_KEY) return null;

  const cached = getCached(placeId);
  if (cached !== undefined) return cached; // includes null

  if (inFlight.has(placeId)) return inFlight.get(placeId);

  const base = normalizeBase(baseUrl);

  const p = (async () => {
    try {
      const photoRef = await fetchPhotoRef(placeId);
      if (!photoRef) {
        setCached(placeId, null);
        return null;
      }

      const proxiedUrl =
        `${base}/api/place-photos/photo` +
        `?photoRef=${encodeURIComponent(photoRef)}&maxwidth=300`;

      setCached(placeId, proxiedUrl);
      return proxiedUrl;
    } catch {
      // don’t keep hammering Google on failures
      setCached(placeId, null);
      return null;
    } finally {
      inFlight.delete(placeId);
    }
  })();

  inFlight.set(placeId, p);
  return p;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = {};
  let i = 0;

  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      try {
        results[item] = await worker(item);
      } catch {
        results[item] = null;
      }
    }
  });

  await Promise.all(runners);
  return results;
}

async function getThumbnailUrls(placeIds, baseUrl, opts = {}) {
  if (!GOOGLE_KEY) return {};

  const { limit = 12, concurrency = 5 } = opts;
  const ids = Array.from(new Set((placeIds || []).filter(Boolean))).slice(0, limit);
  if (ids.length === 0) return {};

  return mapWithConcurrency(ids, concurrency, (id) => getThumbnailUrl(id, baseUrl));
}

module.exports = { getThumbnailUrl, getThumbnailUrls };
