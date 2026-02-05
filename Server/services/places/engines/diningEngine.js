const crypto = require("crypto");
const { createDiag } = require("../pagination/diag");
const { buildSearchCombos, parseDiningMode, shouldRankByDistance } = require("../search/combos");
const { createInitialState, anyCombosRemaining } = require("../pagination/state");
const { fillPending } = require("../pagination/fillPending");
const { fillHydrateSortWithPromoSeek, sortPlacesByPromoThenDistance } = require("../enrich/promosEvents");
const { enrichCuisineWithCache } = require("../enrich/cuisine");
const { hashClientQuery } = require("../query/hash");

function newCursorId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
}

function makeLogger({ debug, reqId }) {
  if (!debug) return null;
  return (msg, obj) => {
    console.log(obj === undefined ? `[places][${reqId}] ${msg}` : `[places][${reqId}] ${msg}`, obj);
  };
}

async function initCtx(ctx) {
  // keep your existing debug instrumentation
  ctx.diag = createDiag();
}

function enforceContinuationConstraints({ state, qIn }) {
  const incomingDiningMode =
    typeof qIn.diningMode !== "undefined" ? parseDiningMode(qIn.diningMode) : null;

  if (incomingDiningMode !== null) {
    const existing = parseDiningMode(state.query?.diningMode);
    if (incomingDiningMode !== existing) {
      return { status: 400, message: "Dining mode changed. Start a new search (reset cursor)." };
    }
  }
  return null;
}

async function buildNewState({ query, cursorId }) {
  const combos = buildSearchCombos({
    isCustom: query.isCustom,
    activityType: query.activityType,
    diningMode: query.diningMode,
    keyword: query.keyword,
    vibes: query.vibes,
  });

  const computedHash = hashClientQuery(query);

  const state = createInitialState({
    cursorId,
    originLat: query.lat,
    originLng: query.lng,
    radiusMeters: query.radiusMeters,
    activityType: query.activityType,
    budget: query.budget,
    isCustom: query.isCustom,
    diningMode: query.diningMode,
    rankByDistance: shouldRankByDistance({
      activityType: query.activityType,
      quickFilter: query.quickFilter || null,
    }),
    combos,

    // immutability contract
    query,
    queryHash: computedHash,

    placesFilters: query.placesFilters,
    keyword: query.keyword,
    vibes: query.vibes,
    familyFriendly: query.familyFriendly,
    when: query.when,
    who: query.who,
  });

  return { state };
}

async function fillHydrateSort({ state, apiKey, want, ctx }) {
  const out = await fillHydrateSortWithPromoSeek({
    state,
    fillPending,
    want,
    apiKey,
    log: ctx?.log,
    diag: ctx?.diag,
    parseDiningMode,
  });

  return { state: out.state || state };
}

async function postProcessPage({ page }) {
  let pageWithCuisine = await Promise.all(page.map(enrichCuisineWithCache));
  pageWithCuisine = sortPlacesByPromoThenDistance(pageWithCuisine);
  return pageWithCuisine;
}

function anyRemaining(state) {
  return anyCombosRemaining(state);
}

function debugMeta({ ctx }) {
  return ctx?.diag ? { counts: ctx.diag.counts, fetch: ctx.diag.fetch } : null;
}

module.exports = {
  provider: "dining",
  newCursorId,
  makeLogger,
  initCtx,
  enforceContinuationConstraints,
  buildNewState,
  fillHydrateSort,
  postProcessPage,
  anyRemaining,
  debugMeta,
};
