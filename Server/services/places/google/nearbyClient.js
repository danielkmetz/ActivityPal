const axios = require("axios");
const { buildNearbyBaseUrl, buildNearbyUrl } = require("./urlBuilders");
const { normalizeErr } = require('../../../utils/normalization/normalizeErr');

async function fetchNearbyPage({ state, combo, meta, apiKey }) {
  const type = combo?.type || null;
  const keyword = combo?.keyword || null;

  const openNowOnly = !!state?.query?.placesFilters?.openNowOnly;

  const baseUrl = buildNearbyBaseUrl({
    lat: state.originLat,
    lng: state.originLng,
    radiusMeters: state.radiusMeters,
    type,
    keyword,
    rankbyDistance: !!state.rankByDistance,
    apiKey,

    // NEW
    openNowOnly,
  });

  const url = buildNearbyUrl(baseUrl, meta?.nextPageToken || null);

  try {
    const r = await axios.get(url, { timeout: 10000 });
    return r?.data || {};
  } catch (e) {
    const err = normalizeErr(e);
    const out = new Error("Google nearbysearch request failed");
    out.details = err;
    out.url = url;
    out.combo = { type, keyword };
    throw out;
  }
}

module.exports = { fetchNearbyPage };
