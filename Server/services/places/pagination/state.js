function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function ensureObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

// --- small helpers (kept local so this file stays self-contained) ---
function safeStr(v, max = 80) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function safeBool(v) {
  return typeof v === "boolean" ? v : !!v;
}

/**
 * Normalize incoming query fields into a stable snapshot for the cursor session.
 * IMPORTANT: This snapshot must NOT change for cursor continuation pages.
 *
 * Supports both:
 * - legacy search body fields
 * - v1 / unified runner normalized query fields
 */
function normalizeQuerySnapshot(input = {}) {
  const q = ensureObj(input);

  const vibes = Array.isArray(q.vibes)
    ? Array.from(
        new Set(
          q.vibes
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean)
        )
      ).slice(0, 2)
    : null;

  const placesFilters = ensureObj(q.placesFilters);
  const avoid = ensureObj(placesFilters.avoid);

  const normPlacesFilters = q.placesFilters
    ? {
        openNowOnly: safeBool(placesFilters.openNowOnly),
        minRating: typeof placesFilters.minRating === "number" ? placesFilters.minRating : null,
        outdoorSeating: safeBool(placesFilters.outdoorSeating),
        liveMusic: safeBool(placesFilters.liveMusic),
        reservable: safeBool(placesFilters.reservable),
        dogFriendly: safeBool(placesFilters.dogFriendly),
        avoid: {
          chains: safeBool(avoid.chains),
          fastFood: safeBool(avoid.fastFood),
          bars: safeBool(avoid.bars),
        },
      }
    : null;

  const eventFilters = ensureObj(q.eventFilters);
  const normEventFilters = q.eventFilters
    ? {
        category: safeStr(eventFilters.category, 40),
        freeOnly: safeBool(eventFilters.freeOnly),
        sort: safeStr(eventFilters.sort, 20) || "date",
      }
    : null;

  return {
    // identity / routing
    mode: safeStr(q.mode, 20),
    provider: safeStr(q.provider, 20), // optional: "dining" | "places2" | "events"
    // NEW: pin which Google API flavor this cursor session is using (optional but recommended)
    apiFlavor: safeStr(q.apiFlavor, 12), // "legacy" | "v1" | null

    placeCategory: safeStr(q.placeCategory, 40),
    eventCategory: safeStr(q.eventCategory, 40),

    activityType: safeStr(q.activityType, 40),
    quickFilter: safeStr(q.quickFilter, 40),
    diningMode: safeStr(q.diningMode, 20),

    // shared prefs
    when: q.when ?? null,            // string or object (already normalized upstream)
    whenAtISO: safeStr(q.whenAtISO, 40),
    who: safeStr(q.who, 40),
    vibes,
    keyword: safeStr(q.keyword, 80),
    familyFriendly: safeBool(q.familyFriendly),

    // time context (used by your evaluators)
    timeZone: safeStr(q.timeZone, 64),
    tzOffsetMinutes:
      Number.isFinite(Number(q.tzOffsetMinutes)) ? Math.trunc(Number(q.tzOffsetMinutes)) : null,

    // filters
    budget: safeStr(q.budget, 4),
    includeUnpriced: typeof q.includeUnpriced === "boolean" ? q.includeUnpriced : null,
    placesFilters: normPlacesFilters,
    eventFilters: normEventFilters,

    // meta
    isCustom: safeBool(q.isCustom),
    source: safeStr(q.source, 20),
  };
}

/**
 * Stream normalization to support BOTH shapes:
 * - Legacy combos: { type, keyword }
 * - v1 streams: { kind:"nearby"|"text", includedTypes?, textQuery?, stage?, oneShot? }
 *
 * We do NOT force legacy combos into v1 streams. We just tag them so meta init works.
 */
function normalizeStream(input) {
  if (!input || typeof input !== "object") return null;

  // v1-style stream already
  if (input.kind === "nearby" || input.kind === "text") {
    const kind = input.kind;
    const stage = safeStr(input.stage, 20) || "primary";
    if (kind === "nearby") {
      const includedTypes = Array.isArray(input.includedTypes)
        ? input.includedTypes.filter(Boolean).map(String)
        : [];
      const maxResultCount = Number.isFinite(Number(input.maxResultCount))
        ? Math.max(1, Math.min(20, Math.floor(Number(input.maxResultCount))))
        : 20;

      return {
        api: "v1",
        kind: "nearby",
        stage,
        includedTypes,
        maxResultCount,
        // your current shared v1 engine treats nearby as one-shot; keep that default
        oneShot: typeof input.oneShot === "boolean" ? input.oneShot : true,
      };
    }

    // text
    const textQuery = safeStr(input.textQuery, 120);
    return {
      api: "v1",
      kind: "text",
      stage,
      textQuery,
    };
  }

  // legacy combo shape
  const type = safeStr(input.type, 40);
  const keyword = safeStr(input.keyword, 120);
  if (!type && !keyword) return null;

  return {
    api: "legacy",
    kind: "legacyCombo",
    type: type || null,
    keyword: keyword || null,
    stage: safeStr(input.stage, 20) || "primary",
  };
}

/**
 * Meta initializer that supports both APIs.
 * We store a superset of fields so either legacy or v1 engines can use it.
 */
function initMetaForStream(stream) {
  const s = normalizeStream(stream);
  if (!s) return { exhausted: true };

  // Legacy uses pageTokens and caps per combo
  if (s.api === "legacy") {
    return {
      pagesFetched: 0,
      nextPageToken: null,
      // keep BOTH names (some code uses tokenReadyAt, some tokenReadyAtMs)
      tokenReadyAt: 0,
      tokenReadyAtMs: 0,
      exhausted: false,
    };
  }

  // v1 nearby one-shot: fetched once
  if (s.api === "v1" && s.kind === "nearby" && s.oneShot) {
    return {
      fetched: false,
      exhausted: false,
    };
  }

  // v1 text OR v1 nearby paged (if you later set oneShot:false)
  return {
    pagesFetched: 0,
    nextPageToken: null,
    tokenReadyAt: 0,
    tokenReadyAtMs: 0,
    exhausted: false,
  };
}

/**
 * Normalize an existing meta entry to the superset shape,
 * and keep tokenReadyAt/tokenReadyAtMs in sync.
 */
function normalizeMeta(meta, stream) {
  const base = ensureObj(meta);
  const init = initMetaForStream(stream);

  const out = { ...init, ...base };

  // sync tokenReadyAt + tokenReadyAtMs
  const tA = Number.isFinite(Number(out.tokenReadyAt)) ? Number(out.tokenReadyAt) : 0;
  const tM = Number.isFinite(Number(out.tokenReadyAtMs)) ? Number(out.tokenReadyAtMs) : 0;
  const t = Math.max(tA, tM, 0);
  out.tokenReadyAt = t;
  out.tokenReadyAtMs = t;

  // normalize primitives
  if (typeof out.exhausted !== "boolean") out.exhausted = !!out.exhausted;
  if (typeof out.fetched !== "boolean" && "fetched" in out) out.fetched = !!out.fetched;
  out.pagesFetched = Number.isFinite(Number(out.pagesFetched)) ? Math.max(0, Math.floor(Number(out.pagesFetched))) : 0;
  out.nextPageToken = typeof out.nextPageToken === "string" && out.nextPageToken.trim() ? out.nextPageToken.trim() : null;

  return out;
}

/**
 * Ensure state.comboMeta exists and matches state.combos length.
 * Backward-compatible: legacy code expects comboMeta.
 */
function ensureComboMeta(state) {
  state.combos = ensureArray(state?.combos);
  const combos = state.combos.map(normalizeStream).filter(Boolean);

  // keep the normalized streams in state.combos ONLY if the incoming already had v1 streams.
  // For legacy combos, we keep the original objects, but meta logic still works.
  const hadV1 = ensureArray(state.combos).some((c) => c && typeof c === "object" && (c.kind === "nearby" || c.kind === "text"));
  if (hadV1) state.combos = combos;

  const metaArr = ensureArray(state?.comboMeta);

  if (metaArr.length !== state.combos.length) {
    state.comboMeta = state.combos.map((c) => initMetaForStream(c));
    return;
  }

  state.comboMeta = state.combos.map((c, i) => normalizeMeta(metaArr[i], c));
}

/**
 * True if we can still fetch more results from at least one combo/stream.
 */
function anyCombosRemaining(state) {
  ensureComboMeta(state);
  const combos = ensureArray(state?.combos);
  const meta = ensureArray(state?.comboMeta);

  for (let i = 0; i < combos.length; i++) {
    const s = normalizeStream(combos[i]);
    const m = meta[i] || {};

    if (!s) continue;

    // v1 nearby one-shot: remaining if not fetched and not exhausted
    if (s.api === "v1" && s.kind === "nearby" && s.oneShot) {
      if (!m.exhausted && !m.fetched) return true;
      continue;
    }

    // legacy paged OR v1 paged/text: remaining if not exhausted
    if (!m.exhausted) return true;
  }

  return false;
}

/**
 * Strict compatibility check for cursor continuation.
 * Prefer queryHash if present; fall back to snapshot compare for older clients.
 */
function assertCursorQueryCompatible(state, incomingQuery) {
  const aHash = typeof state?.queryHash === "string" && state.queryHash.trim() ? state.queryHash.trim() : null;
  const bHash = typeof incomingQuery?.queryHash === "string" && incomingQuery.queryHash.trim() ? incomingQuery.queryHash.trim() : null;

  if (aHash && bHash && aHash !== bHash) {
    return { ok: false, field: "queryHash", expected: aHash, got: bHash };
  }

  const a = ensureObj(state?.query);
  const b = normalizeQuerySnapshot(incomingQuery);

  const keys = [
    "mode",
    "provider",
    "apiFlavor",
    "placeCategory",
    "eventCategory",
    "activityType",
    "quickFilter",
    "diningMode",
    "budget",
    "includeUnpriced",
    "isCustom",
    "when",
    "whenAtISO",
    "who",
    "keyword",
    "familyFriendly",
    "timeZone",
    "tzOffsetMinutes",
  ];

  for (const k of keys) {
    const av = a[k];
    const bv = b[k];

    if (typeof av === "object" || typeof bv === "object") {
      const aj = JSON.stringify(av ?? null);
      const bj = JSON.stringify(bv ?? null);
      if (aj !== bj) return { ok: false, field: k, expected: av ?? null, got: bv ?? null };
    } else if ((av ?? null) !== (bv ?? null)) {
      return { ok: false, field: k, expected: av ?? null, got: bv ?? null };
    }
  }

  const vibesA = JSON.stringify(a.vibes ?? null);
  const vibesB = JSON.stringify(b.vibes ?? null);
  if (vibesA !== vibesB) return { ok: false, field: "vibes", expected: a.vibes ?? null, got: b.vibes ?? null };

  const pfA = JSON.stringify(a.placesFilters ?? null);
  const pfB = JSON.stringify(b.placesFilters ?? null);
  if (pfA !== pfB) return { ok: false, field: "placesFilters", expected: a.placesFilters ?? null, got: b.placesFilters ?? null };

  const efA = JSON.stringify(a.eventFilters ?? null);
  const efB = JSON.stringify(b.eventFilters ?? null);
  if (efA !== efB) return { ok: false, field: "eventFilters", expected: a.eventFilters ?? null, got: b.eventFilters ?? null };

  return { ok: true };
}

/**
 * Initializes a fresh pagination/search state for a new cursor session.
 * This supports both:
 * - legacy combos (array of {type, keyword})
 * - v1 streams (array of {kind:"nearby"/"text", ...})
 */
function createInitialState({
  cursorId,
  originLat,
  originLng,
  radiusMeters,

  // identity (legacy)
  activityType,
  budget,
  isCustom,
  diningMode,
  rankByDistance,

  // NEW: stable hash enforced by runPaginatedSearch
  queryHash,

  // NEW: full normalized query snapshot (recommended)
  query,

  // combos/streams
  combos,

  // schema
  version = 5, // bump: now supports v1 stream meta + queryHash
  provider = null, // optional: "dining" | "places2" | "events"
  apiFlavor = null, // optional: "legacy" | "v1"
}) {
  const combosArr = ensureArray(combos);

  const querySnapshot = normalizeQuerySnapshot({
    ...(ensureObj(query) || {}),
    activityType,
    budget,
    isCustom,
    diningMode,
    provider,
    apiFlavor,
  });

  const state = {
    v: version,
    cursorId,
    provider: provider || querySnapshot.provider || null,

    // REQUIRED by your unified runner
    queryHash: typeof queryHash === "string" && queryHash.trim() ? queryHash.trim() : null,

    createdAtISO: new Date().toISOString(),
    updatedAtISO: new Date().toISOString(),

    originLat: Number(originLat),
    originLng: Number(originLng),
    radiusMeters: Number(radiusMeters),

    // legacy fields (kept)
    activityType: activityType || querySnapshot.activityType || null,
    budget: budget ?? querySnapshot.budget ?? null,
    isCustom: !!isCustom,
    diningMode: diningMode || querySnapshot.diningMode || null,
    rankByDistance: !!rankByDistance,

    // stable snapshot
    query: querySnapshot,

    // streams/combos
    combos: combosArr,

    // index aliases (some engines use comboIndex, others use cursorIndex)
    comboIndex: 0,
    cursorIndex: 0,

    comboMeta: [],

    // de-dupe + buffering across calls
    seenIds: [],
    pending: [],

    // instrumentation / helpers
    _visitedCombos: [],

    // paging counters (used by runPaginatedSearch meta, optional)
    pageNo: 0,
    versionNo: 0,
  };

  // build meta based on the stream/legacy combo shape
  ensureComboMeta(state);

  return state;
}

/**
 * Small helper used by the handler: take a page from state.pending.
 */
function takePageFromPending(state, perPage) {
  state.pending = ensureArray(state.pending);

  const n = Math.max(0, Number(perPage) || 0);
  const page = state.pending.splice(0, n);

  state.updatedAtISO = new Date().toISOString();
  return page;
}

/**
 * Optional: call this on cursorStore.get() results to safely handle older stored states.
 * (Not required, but it prevents “old cursor crashes”)
 */
function migrateStateInPlace(state) {
  if (!state || typeof state !== "object") return state;

  if (typeof state.cursorIndex !== "number") state.cursorIndex = Number(state.comboIndex || 0) || 0;
  if (typeof state.comboIndex !== "number") state.comboIndex = Number(state.cursorIndex || 0) || 0;

  if (typeof state.queryHash !== "string") state.queryHash = null;
  if (!state.query || typeof state.query !== "object") state.query = normalizeQuerySnapshot({});

  ensureComboMeta(state);

  if (!Array.isArray(state.pending)) state.pending = [];
  if (!Array.isArray(state.seenIds)) state.seenIds = [];

  return state;
}

module.exports = {
  ensureArray,
  anyCombosRemaining,
  normalizeQuerySnapshot,
  assertCursorQueryCompatible,
  createInitialState,
  takePageFromPending,

  // optional export if you want to use it in cursorStore.get()
  migrateStateInPlace,
};
