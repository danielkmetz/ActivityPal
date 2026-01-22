const axios = require("axios");
const { buildNearbyBaseUrl, buildNearbyUrl } = require("./urlBuilders");

function normalizeErr(e) {
  return {
    name: e?.name,
    message: e?.message,
    code: e?.code,
    status: e?.response?.status,
    dataStatus: e?.response?.data?.status,
  };
}

/**
 * Fetch a single Google Nearby Search page for a specific combo + its meta.
 *
 * NOTE:
 * - We do NOT loop pages here. Caller owns pagination.
 * - We do NOT sleep/retry INVALID_REQUEST here. Caller owns tokenReadyAt gating.
 *
 * Params:
 *  - state: your cursor state (originLat/originLng/radiusMeters/rankByDistance)
 *  - combo: { type, keyword }
 *  - meta:  { nextPageToken }  (optional)
 *  - apiKey: string
 */
async function fetchNearbyPage({ state, combo, meta, apiKey }) {
  const type = combo?.type || null;
  const keyword = combo?.keyword || null;

  const baseUrl = buildNearbyBaseUrl({
    lat: state.originLat,
    lng: state.originLng,
    radiusMeters: state.radiusMeters,
    type,
    keyword,
    rankbyDistance: !!state.rankByDistance,
    apiKey,
  });

  const url = buildNearbyUrl(baseUrl, meta?.nextPageToken || null);

  try {
    const r = await axios.get(url, { timeout: 10000 });
    return r?.data || {};
  } catch (e) {
    const err = normalizeErr(e);
    // Throw an error so the caller can mark the combo exhausted if desired
    const out = new Error("Google nearbysearch request failed");
    out.details = err;
    out.url = url;
    out.combo = { type, keyword };
    throw out;
  }
}

module.exports = { fetchNearbyPage };
