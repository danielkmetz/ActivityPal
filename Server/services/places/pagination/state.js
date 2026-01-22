function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * True if we can still fetch more results from at least one combo.
 */
function anyCombosRemaining(state) {
  const meta = ensureArray(state?.comboMeta);
  return meta.some((m) => !m?.exhausted);
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
  activityType,
  budget,
  isCustom,
  diningMode,
  rankByDistance,
  combos,
  version = 3,
}) {
  const combosArr = ensureArray(combos);

  return {
    v: version,
    cursorId,
    createdAtISO: new Date().toISOString(),
    updatedAtISO: new Date().toISOString(),

    originLat: Number(originLat),
    originLng: Number(originLng),
    radiusMeters: Number(radiusMeters),

    activityType: activityType || null,
    budget: budget || null,
    isCustom: !!isCustom,

    diningMode: diningMode || null,
    rankByDistance: !!rankByDistance,

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
 * (Kept here to avoid re-implementing splice logic in the handler.)
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
  createInitialState,
  takePageFromPending,
};
