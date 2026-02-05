const crypto = require("crypto");
const { createCursorStore } = require("../cursorStore/cursorStore");
const { CURSOR_TTL_SEC } = require("../pagination/constants");
const { runPaginatedSearch } = require("../pagination/runPaginatedSearch");
const { normalizeErr } = require("../../../utils/normalization/normalizeErr");
const { getRedisClient } = require("../../redis/client");
const diningEngine = require("../engines/diningEngine");

const { cursorStore, useRedis } = createCursorStore({
  ttlSec: CURSOR_TTL_SEC,
  keyPrefix: "places:v3:cursor:",
  getRedisClient,
});

function newReqId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Keep logs safe: no tokens, no emails, no addresses, no precise lat/lng.
function summarizeBody(body) {
  const b = isPlainObject(body) ? body : null;
  const q = isPlainObject(b?.query) ? b.query : null;
  const src = q || b || {};

  return {
    hasBody: !!b,
    hasQueryWrapper: !!q,
    bodyKeys: b ? Object.keys(b).slice(0, 40) : [],
    queryKeys: q ? Object.keys(q).slice(0, 40) : [],

    // paging intent
    hasCursor: typeof src.cursor === "string" && !!src.cursor.trim(),
    perPage: typeof src.perPage === "number" ? src.perPage : src.perPage ? String(src.perPage).slice(0, 16) : null,
    hasQueryHash: typeof src.queryHash === "string" && src.queryHash.trim().length > 0,
    debugFlag: src.debug === true,

    // selection intent (don’t log values that can be sensitive)
    hasLat: Number.isFinite(Number(src.lat)),
    hasLng: Number.isFinite(Number(src.lng)),
    hasRadiusMeters: Number.isFinite(Number(src.radiusMeters ?? src.radius)),
    mode: typeof src.mode === "string" ? src.mode : null,
    activityType: typeof src.activityType === "string" ? src.activityType : null,
    quickFilter: typeof src.quickFilter === "string" ? src.quickFilter : null,
    placeCategory: typeof src.placeCategory === "string" ? src.placeCategory : null,

    // flags
    familyFriendly: src.familyFriendly === true,
    hasWho: typeof src.who === "string" && !!src.who.trim(),
    hasWhen: !!src.when,
    hasWhenAtISO: typeof src.whenAtISO === "string" && !!src.whenAtISO.trim(),

    // avoid logging keyword text; only whether it exists
    hasKeyword: typeof src.keyword === "string" && !!src.keyword.trim(),
    hasVibes: Array.isArray(src.vibes) && src.vibes.length > 0,
    hasPlacesFilters: isPlainObject(src.placesFilters),
  };
}

function summarizeOut(out) {
  if (!out || typeof out !== "object") return { outType: typeof out };

  const meta = out.meta && typeof out.meta === "object" ? out.meta : null;

  return {
    hasError: !!out.error,
    errorStatus: out.error?.status ?? null,
    errorMessage: out.error?.message ? String(out.error.message).slice(0, 220) : null,

    // success shape
    curatedPlacesLen: Array.isArray(out.curatedPlaces) ? out.curatedPlaces.length : null,
    meta: meta
      ? {
          cursor: meta.cursor ? "[present]" : null,
          perPage: meta.perPage ?? null,
          hasMore: meta.hasMore ?? null,
          provider: meta.provider ?? null,
          storage: meta.storage ?? null,
          pageNo: meta.pageNo ?? null,
          version: meta.version ?? null,
          elapsedMs: meta.elapsedMs ?? null,
        }
      : null,
  };
}

async function placesHandler(req, res) {
  const reqId = newReqId();
  const t0 = Date.now();

  try {
    const apiKey = process.env.GOOGLE_KEY;

    const hasKey = typeof apiKey === "string" && apiKey.length > 10;
    
    // If you’re suddenly getting 500s, this is a common culprit.
    if (!hasKey) {
      console.error("[places][misconfig]", { reqId, msg: "Missing/invalid GOOGLE_KEY env var" });
      return res.status(500).json({ error: "Server misconfigured (Google key missing)." });
    }

    // Catch obvious request-shape failures early
    if (!isPlainObject(req.body)) {
      console.error("[places][bad-body]", { reqId, type: typeof req.body });
      return res.status(400).json({ error: "Invalid request body." });
    }

    const debugEnv = process.env.DEBUG_PLACES === "1";

    const out = await runPaginatedSearch({
      body: req.body,
      apiKey,
      cursorStore,
      useRedis,
      engine: diningEngine,
      reqId,
      debugEnv,
    });

    return res.json(out);
  } catch (e) {
    const n = normalizeErr(e);

    // Print stack too, because normalizeErr often hides the actual throw site.
    console.error("[places][exception]", {
      reqId,
      elapsedMs: Date.now() - t0,
      normalized: n,
      message: e?.message || null,
      stack: e?.stack || null,
    });

    return res.status(500).json({ error: "Something went wrong fetching nearby places." });
  }
}

module.exports = { placesHandler };
