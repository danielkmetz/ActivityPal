const crypto = require("crypto");
const { createDiag } = require("./pagination/diag");
const { MIN_PER_PAGE, MAX_PER_PAGE, PREFETCH_BUFFER, CURSOR_TTL_SEC } = require("./pagination/constants");
const { parseCursor, parsePerPage, validateNewSearchBody } = require("./validation");
const { createMemoryCursorStore } = require("./cursorStore/memoryCursorStore");
const { buildSearchCombos, parseDiningMode, shouldRankByDistance } = require("./search/combos");
const { anyCombosRemaining, createInitialState } = require("./pagination/state");
const { fillPending } = require("./pagination/fillPending");
const { fillHydrateSortWithPromoSeek, sortPlacesByPromoThenDistance } = require("./enrich/promosEvents");
const { enrichCuisineWithCache } = require("./enrich/cuisine");
const { createRedisCursorStore } = require("./cursorStore/redisCursorStore");

const useRedis = !!process.env.REDIS_URL;

const memoryStore = createMemoryCursorStore({
  ttlSec: CURSOR_TTL_SEC,
  keyPrefix: "places:v3:cursor:",
});

const cursorStore = useRedis
  ? createRedisCursorStore({
      ttlSec: CURSOR_TTL_SEC,
      keyPrefix: "places:v3:cursor:",
      fallbackStore: memoryStore, // optional but smart
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

async function placesHandler(req, res) {
  const t0 = Date.now();
  const reqId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "";
  const debug = process.env.DEBUG_PLACES === "1" || req.body.debug === true;
  const log = (msg, obj) => { if (debug) console.log(obj === undefined ? `[places][${reqId}] ${msg}` : `[places][${reqId}] ${msg}`, obj); };

  const diag = createDiag();

  try {
    const apiKey = process.env.GOOGLE_KEY;
    if (!(typeof apiKey === "string" && apiKey.length > 10)) {
      return res.status(500).json({ error: "Server misconfigured (Google API key missing)." });
    }

    const perPageNum = parsePerPage(req.body.perPage, { MIN_PER_PAGE, MAX_PER_PAGE });
    const cursor = parseCursor(req.body.cursor);

    let state;
    let cursorId = cursor;

    if (cursorId) {
      state = await cursorStore.get(cursorId);
      if (!state) {
        log("cursor:invalid", { cursor: safeCursor(cursorId) });
        return res.status(400).json({ error: "Invalid or expired cursor. Start a new search." });
      }

      if (state.activityType === "Dining" && typeof req.body.diningMode !== "undefined") {
        const incoming = parseDiningMode(req.body.diningMode);
        const existing = parseDiningMode(state.diningMode);
        if (incoming !== existing) {
          return res.status(400).json({ error: "Dining mode changed. Start a new search (reset cursor).", meta: { cursor: null, hasMore: false } });
        }
      }
    } else {
      const v = validateNewSearchBody(req.body);
      if (!v.ok) return res.status(v.status).json({ error: v.error });

      const diningModeNorm = v.value.activityType === "Dining" ? parseDiningMode(v.value.diningMode) : null;

      const combos = buildSearchCombos({
        isCustom: v.value.isCustom,
        activityType: v.value.activityType,
        diningMode: diningModeNorm,
      });

      if (!combos.length) {
        return res.json({ curatedPlaces: [], meta: { cursor: null, perPage: perPageNum, hasMore: false, elapsedMs: Date.now() - t0 } });
      }

      cursorId = crypto.randomUUID();
      state = createInitialState({
        cursorId,
        originLat: v.value.lat,
        originLng: v.value.lng,
        radiusMeters: v.value.radiusMeters,
        activityType: v.value.activityType,
        budget: v.value.budget,
        isCustom: v.value.isCustom,
        diningMode: diningModeNorm,
        rankByDistance: shouldRankByDistance(v.value.activityType),
        combos,
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

    const hasMoreBeforeTake = (Array.isArray(state.pending) && state.pending.length > 0) || anyCombosRemaining(state);

    if (!hasMoreBeforeTake && (!Array.isArray(state.pending) || state.pending.length === 0)) {
      await cursorStore.del(cursorId);
      return res.json({
        curatedPlaces: [],
        meta: { cursor: null, perPage: perPageNum, hasMore: false, elapsedMs: Date.now() - t0, ...(debug ? { debug: { counts: diag.counts, fetch: diag.fetch } } : {}) },
      });
    }

    const page = state.pending.splice(0, perPageNum);
    state.updatedAtISO = new Date().toISOString();

    let pageWithCuisine = await Promise.all(page.map(enrichCuisineWithCache));
    pageWithCuisine = sortPlacesByPromoThenDistance(pageWithCuisine);

    const hasMore = (Array.isArray(state.pending) && state.pending.length > 0) || anyCombosRemaining(state);

    if (hasMore) await cursorStore.set(cursorId, state);
    else { await cursorStore.del(cursorId); cursorId = null; }

    return res.json({
      curatedPlaces: pageWithCuisine,
      meta: {
        cursor: cursorId,
        perPage: perPageNum,
        hasMore,
        elapsedMs: Date.now() - t0,
        storage: "memory",
        activityType: state?.activityType || null,
        diningMode: state?.diningMode || null,
        rankByDistance: !!state?.rankByDistance,
        ...(debug ? { debug: { counts: diag.counts, fetch: diag.fetch } } : {}),
      },
    });
  } catch (e) {
    console.error("places endpoint error", { reqId, elapsedMs: Date.now() - t0, ...normalizeErr(e) });
    return res.status(500).json({ error: "Something went wrong fetching nearby places." });
  }
}

module.exports = { placesHandler };
