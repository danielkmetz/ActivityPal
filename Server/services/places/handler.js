const crypto = require("crypto");
const { createDiag } = require("./pagination/diag");
const { MIN_PER_PAGE, MAX_PER_PAGE, PREFETCH_BUFFER, CURSOR_TTL_SEC } = require("./pagination/constants");
const { parseCursor, parsePerPage, validateNewSearchBody } = require("./validation");
const { createMemoryCursorStore } = require("./cursorStore/memoryCursorStore");
const { createRedisCursorStore } = require("./cursorStore/redisCursorStore");
const { buildSearchCombos, parseDiningMode, shouldRankByDistance } = require("./search/combos");
const { anyCombosRemaining, createInitialState } = require("./pagination/state");
const { fillPending } = require("./pagination/fillPending");
const { fillHydrateSortWithPromoSeek, sortPlacesByPromoThenDistance } = require("./enrich/promosEvents");
const { enrichCuisineWithCache } = require("./enrich/cuisine");

const useRedis = !!process.env.REDIS_URL;

const memoryStore = createMemoryCursorStore({
  ttlSec: CURSOR_TTL_SEC,
  keyPrefix: "places:v3:cursor:",
});

const cursorStore = useRedis
  ? createRedisCursorStore({
    ttlSec: CURSOR_TTL_SEC,
    keyPrefix: "places:v3:cursor:",
    fallbackStore: memoryStore,
  })
  : memoryStore;

function safeCursor(c) {
  return typeof c === "string" && c.length ? `${c.slice(0, 6)}…${c.slice(-4)}` : null;
}

function normalizeErr(e) {
  return {
    name: e?.name,
    message: e?.message,
    code: e?.code,
    status: e?.response?.status,
    dataStatus: e?.response?.data?.status,
  };
}

// ---- Canonical query parsing ----
// Frontend now sends a “query” shape. Sometimes it’s top-level, sometimes nested.
// We accept both and normalize.
function getIncomingQuery(body) {
  const q = body && typeof body.query === "object" && body.query ? body.query : body || {};
  return q;
}

function normalizeRadiusMeters(q) {
  // your frontend uses `radius` (meters). your backend historically used `radiusMeters`.
  const r = q.radiusMeters ?? q.radius;
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeKeyword(q) {
  const s = String(q.keyword || "").trim();
  return s ? s : null;
}

function normalizeVibes(q) {
  const v = Array.isArray(q.vibes) ? q.vibes.filter(Boolean) : [];
  return v.length ? v.slice(0, 2) : null;
}

function normalizePlacesFilters(q) {
  // expects the new frontend shape (or null)
  const pf = q.placesFilters && typeof q.placesFilters === "object" ? q.placesFilters : null;
  if (!pf) return null;

  const avoid = pf.avoid && typeof pf.avoid === "object" ? pf.avoid : {};
  return {
    openNowOnly: !!pf.openNowOnly,
    minRating: typeof pf.minRating === "number" ? pf.minRating : null,
    outdoorSeating: !!pf.outdoorSeating,
    liveMusic: !!pf.liveMusic,
    reservable: !!pf.reservable,
    dogFriendly: !!pf.dogFriendly,
    avoid: {
      chains: !!avoid.chains,
      fastFood: !!avoid.fastFood,
      bars: !!avoid.bars,
    },
  };
}

function canonicalizeQuery(body, perPageNum) {
  const q = getIncomingQuery(body);

  const lat = Number(q.lat);
  const lng = Number(q.lng);
  const radiusMeters = normalizeRadiusMeters(q);

  const isCustom =
    typeof q.isCustom === "boolean"
      ? q.isCustom
      : q.source === "custom"
        ? true
        : false;

  // Dining endpoint: still “places provider: dining”
  // Frontend routes food_drink => dining, but may also send activityType:"Dining"
  const activityType = "Dining";

  const diningModeNorm = parseDiningMode(q.diningMode ?? q.placesFilters?.diningMode);

  const budget = q.budget ?? null;

  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    radiusMeters,
    perPage: perPageNum,
    activityType,
    budget,
    isCustom,
    diningMode: diningModeNorm,

    // expanded prefs (store even if you don’t fully use them yet)
    when: q.when ?? null,
    who: q.who ?? null,
    vibes: normalizeVibes(q),
    keyword: normalizeKeyword(q),
    familyFriendly: !!q.familyFriendly,
    placesFilters: normalizePlacesFilters(q),
  };
}

// stable hash so “cursor requests” can enforce immutable query
function hashQuery(query) {
  // IMPORTANT: ensure stable stringify order
  const stable = {
    lat: query.lat,
    lng: query.lng,
    radiusMeters: query.radiusMeters,
    activityType: query.activityType,
    budget: query.budget,
    isCustom: query.isCustom,
    diningMode: query.diningMode,

    when: query.when,
    who: query.who,
    vibes: query.vibes,
    keyword: query.keyword,
    familyFriendly: query.familyFriendly,
    placesFilters: query.placesFilters,
  };

  const json = JSON.stringify(stable);
  return crypto.createHash("sha1").update(json).digest("hex");
}

async function placesHandler(req, res) {
  const t0 = Date.now();
  const reqId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "";
  const debug = process.env.DEBUG_PLACES === "1" || req.body.debug === true;
  const log = (msg, obj) => {
    if (!debug) return;
    console.log(
      obj === undefined ? `[places][${reqId}] ${msg}` : `[places][${reqId}] ${msg}`,
      obj
    );
  };

  const diag = createDiag();

  try {
    const apiKey = process.env.GOOGLE_KEY;
    if (!(typeof apiKey === "string" && apiKey.length > 10)) {
      return res
        .status(500)
        .json({ error: "Server misconfigured (Google API key missing)." });
    }

    const perPageNum = parsePerPage(req.body.perPage, { MIN_PER_PAGE, MAX_PER_PAGE });
    const cursor = parseCursor(req.body.cursor);

    let state;
    let cursorId = cursor;

    if (cursorId) {
      // ---- continuation ----
      state = await cursorStore.get(cursorId);
      if (!state) {
        log("cursor:invalid", { cursor: safeCursor(cursorId) });
        return res
          .status(400)
          .json({ error: "Invalid or expired cursor. Start a new search." });
      }

      // Optional: if frontend sends queryHash, enforce it
      const incomingHash = typeof req.body.queryHash === "string" ? req.body.queryHash : null;
      if (incomingHash && state.queryHash && incomingHash !== state.queryHash) {
        return res.status(400).json({
          error: "Query changed. Start a new search (reset cursor).",
          meta: { cursor: null, hasMore: false },
        });
      }

      // Hard enforcement: prevent “diningMode” flips mid-session
      const incomingDiningMode = typeof req.body.diningMode !== "undefined"
        ? parseDiningMode(req.body.diningMode)
        : null;

      if (incomingDiningMode !== null) {
        const existing = parseDiningMode(state.query?.diningMode);
        if (incomingDiningMode !== existing) {
          return res.status(400).json({
            error: "Dining mode changed. Start a new search (reset cursor).",
            meta: { cursor: null, hasMore: false },
          });
        }
      }
    } else {
      // ---- new search ----
      // Keep your existing validator, but upgrade it to accept new field names (radius/radiusMeters, etc.)
      const v = validateNewSearchBody(req.body);
      if (!v.ok) return res.status(v.status).json({ error: v.error });

      const query = canonicalizeQuery(req.body, perPageNum);

      if (!query.lat || !query.lng || !query.radiusMeters) {
        return res.status(400).json({ error: "Missing or invalid lat/lng/radius." });
      }

      const combos = buildSearchCombos({
        isCustom: query.isCustom,
        activityType: query.activityType,
        diningMode: query.diningMode,

        // NEW: allow keyword to influence combos (backend can ignore until implemented)
        keyword: query.keyword,
        vibes: query.vibes,
      });

      if (!combos.length) {
        return res.json({
          curatedPlaces: [],
          meta: {
            cursor: null,
            perPage: perPageNum,
            hasMore: false,
            elapsedMs: Date.now() - t0,
            provider: "dining",
            storage: useRedis ? "redis" : "memory",
          },
        });
      }

      cursorId = crypto.randomUUID();
      state = createInitialState({
        cursorId,
        originLat: query.lat,
        originLng: query.lng,
        radiusMeters: query.radiusMeters,
        activityType: query.activityType,
        budget: query.budget,
        isCustom: query.isCustom,
        diningMode: query.diningMode,
        rankByDistance: shouldRankByDistance({ activityType: query.activityType, quickFilter: null }),
        combos,

        // NEW: store canonical query + hash so pagination is stable
        query,
        queryHash: hashQuery(query),

        // NEW: store filters separately if you prefer
        placesFilters: query.placesFilters,
        keyword: query.keyword,
        vibes: query.vibes,
        familyFriendly: query.familyFriendly,
        when: query.when,
        who: query.who,
      });

      await cursorStore.set(cursorId, state);
    }

    const want = perPageNum + PREFETCH_BUFFER;

    state = await fillHydrateSortWithPromoSeek({
      state,
      fillPending,
      want,
      apiKey,
      log,
      diag,
      parseDiningMode,
    });

    const hasMoreBeforeTake =
      (Array.isArray(state.pending) && state.pending.length > 0) ||
      anyCombosRemaining(state);

    if (!hasMoreBeforeTake && (!Array.isArray(state.pending) || state.pending.length === 0)) {
      await cursorStore.del(cursorId);
      return res.json({
        curatedPlaces: [],
        meta: {
          cursor: null,
          perPage: perPageNum,
          hasMore: false,
          elapsedMs: Date.now() - t0,
          provider: "dining",
          storage: useRedis ? "redis" : "memory",
          queryHash: state?.queryHash || null,
          ...(debug ? { debug: { counts: diag.counts, fetch: diag.fetch } } : {}),
        },
      });
    }

    const page = state.pending.splice(0, perPageNum);
    state.updatedAtISO = new Date().toISOString();

    let pageWithCuisine = await Promise.all(page.map(enrichCuisineWithCache));
    pageWithCuisine = sortPlacesByPromoThenDistance(pageWithCuisine);

    const hasMore =
      (Array.isArray(state.pending) && state.pending.length > 0) ||
      anyCombosRemaining(state);

    if (hasMore) await cursorStore.set(cursorId, state);
    else {
      await cursorStore.del(cursorId);
      cursorId = null;
    }

    return res.json({
      curatedPlaces: pageWithCuisine,
      meta: {
        cursor: cursorId,
        perPage: perPageNum,
        hasMore,
        elapsedMs: Date.now() - t0,
        provider: "dining",
        storage: useRedis ? "redis" : "memory",
        queryHash: state?.queryHash || null,
        activityType: state?.activityType || null,
        diningMode: state?.diningMode || null,
        rankByDistance: !!state?.rankByDistance,
        ...(debug ? { debug: { counts: diag.counts, fetch: diag.fetch } } : {}),
      },
    });
  } catch (e) {
    console.error("places endpoint error", {
      reqId,
      elapsedMs: Date.now() - t0,
      ...normalizeErr(e),
    });
    return res
      .status(500)
      .json({ error: "Something went wrong fetching nearby places." });
  }
}

module.exports = { placesHandler };
