const { createCursorStore } = require("../cursorStore/cursorStore");
const { runPaginatedSearch } = require("../pagination/runPaginatedSearch");
const { getRedisClient } = require('../../redis/client');
const places2Engine = require("../engines/places2Engine");

const { cursorStore, useRedis } = createCursorStore({
  ttlSec: 600,
  keyPrefix: "places:places2:cursor:",
  getRedisClient,
});

async function getCuratedPlacesNearbyV1({ query, apiKey, now = new Date() } = {}) {
  // runPaginatedSearch expects the same input pattern normalizePlacesRequest accepts:
  // wrapper OR legacy. We pass wrapper to be explicit.
  const out = await runPaginatedSearch({
    body: { query },
    apiKey,
    cursorStore,
    useRedis,
    engine: places2Engine,
    now,
    reqId: query?.reqId ? String(query.reqId) : null,
    debugEnv: false,
  });

  // Keep your existing non-express calling convention:
  // return { error: {status, message} } OR { curatedPlaces, meta }
  return out;
}

module.exports = { getCuratedPlacesNearbyV1 };
