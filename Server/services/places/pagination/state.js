function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function ensureObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

/**
 * True if we can still fetch more results from at least one combo.
 */
function anyCombosRemaining(state) {
  const meta = ensureArray(state?.comboMeta);
  return meta.some((m) => !m?.exhausted);
}

/**
 * Normalize incoming query fields into a stable snapshot for the cursor session.
 * IMPORTANT: This snapshot must NOT change for cursor continuation pages.
 */
function normalizeQuerySnapshot(input = {}) {
  const q = ensureObj(input);

  const mode = typeof q.mode === "string" ? q.mode : null;

  // keep strings small + consistent
  const safeStr = (v, max = 80) => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s) return null;
    return s.length > max ? s.slice(0, max) : s;
  };

  const safeBool = (v) => (typeof v === "boolean" ? v : !!v);

  const vibes = Array.isArray(q.vibes)
    ? Array.from(new Set(q.vibes.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean))).slice(0, 2)
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
    // high-level search identity
    mode: mode || null,
    placeCategory: safeStr(q.placeCategory, 40),
    eventCategory: safeStr(q.eventCategory, 40),

    // legacy / current backend identity
    activityType: safeStr(q.activityType, 40),
    quickFilter: safeStr(q.quickFilter, 40),
    diningMode: safeStr(q.diningMode, 20),

    // shared prefs
    when: q.when ?? null, // can be string or object; already normalized in validateNewSearchBody
    who: safeStr(q.who, 40),
    vibes,
    keyword: safeStr(q.keyword, 80),
    familyFriendly: safeBool(q.familyFriendly),

    // filters
    budget: safeStr(q.budget, 4),
    placesFilters: normPlacesFilters,
    eventFilters: normEventFilters,

    // meta
    isCustom: safeBool(q.isCustom),
    source: safeStr(q.source, 20), // optional
    provider: safeStr(q.provider, 20), // optional (dining/places2/events)
  };
}

/**
 * Strict compatibility check for cursor continuation.
 * If the incoming request attempts to change the search, reject it.
 */
function assertCursorQueryCompatible(state, incomingQuery) {
  const a = ensureObj(state?.query);
  const b = normalizeQuerySnapshot(incomingQuery);

  // Pick fields that *must* remain identical across pages.
  // If you later add filters that affect evaluatePlace(), add them here too.
  const keys = [
    "mode",
    "placeCategory",
    "eventCategory",
    "activityType",
    "quickFilter",
    "diningMode",
    "budget",
    "isCustom",
    "when",
    "who",
    "keyword",
    "familyFriendly",
  ];

  for (const k of keys) {
    const av = a[k];
    const bv = b[k];

    // compare primitives + simple objects
    if (typeof av === "object" || typeof bv === "object") {
      const aj = JSON.stringify(av ?? null);
      const bj = JSON.stringify(bv ?? null);
      if (aj !== bj) {
        return { ok: false, field: k, expected: av ?? null, got: bv ?? null };
      }
    } else if ((av ?? null) !== (bv ?? null)) {
      return { ok: false, field: k, expected: av ?? null, got: bv ?? null };
    }
  }

  // vibes + filters: these materially change results; lock them too
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
 * This should be the single source of truth for the "shape" of state.
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

  // NEW: full normalized query snapshot (recommended)
  query, // pass validateNewSearchBody().value here

  combos,
  version = 4, // bump: state shape changed
  provider = null, // optional: "dining" | "places2" | "events"
}) {
  const combosArr = ensureArray(combos);
  const querySnapshot = normalizeQuerySnapshot({
    ...(ensureObj(query) || {}),
    activityType,
    budget,
    isCustom,
    diningMode,
    provider,
  });

  return {
    v: version,
    cursorId,
    provider: provider || querySnapshot.provider || null,

    createdAtISO: new Date().toISOString(),
    updatedAtISO: new Date().toISOString(),

    originLat: Number(originLat),
    originLng: Number(originLng),
    radiusMeters: Number(radiusMeters),

    // keep legacy fields for old code paths
    activityType: activityType || querySnapshot.activityType || null,
    budget: budget ?? querySnapshot.budget ?? null,
    isCustom: !!isCustom,

    diningMode: diningMode || querySnapshot.diningMode || null,
    rankByDistance: !!rankByDistance,

    // NEW: stable snapshot for this cursor session
    query: querySnapshot,

    combos: combosArr,
    comboIndex: 0,
    comboMeta: combosArr.map(() => ({
      pagesFetched: 0,
      nextPageToken: null,
      tokenReadyAt: 0,
      exhausted: false,
    })),

    // de-dupe + buffering across calls
    seenIds: [],
    pending: [],

    // used to ensure we "touch" each combo before stopping early
    _visitedCombos: [],
  };
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

module.exports = {
  ensureArray,
  anyCombosRemaining,
  normalizeQuerySnapshot,
  assertCursorQueryCompatible,
  createInitialState,
  takePageFromPending,
};
