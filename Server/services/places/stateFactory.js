// stateFactory.js

const { EXCLUDED_TYPES, budgetToMaxTier } = require("./v1/config");
const { buildV1NearbyPlan, shouldRankByDistance } = require("./search/combos");
const { normalizeBudget, normalizeTimeCtx } = require("./query/queryNormalization");
const { normalizeWho, buildWhoProfile } = require("../../utils/places/curation/whoProfile");
const { parseWhenAtISO } = require("../../utils/places/timeHelpers");
const { hashClientQuery, hashEngineStable } = require("./query/hash"); // adjust path

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function buildExcludedTypesForActivity({ activityType, placeCategory }) {
  const t = activityType || placeCategory || null;
  return t === "Dining" ? EXCLUDED_TYPES.filter((x) => x !== "meal_takeaway") : EXCLUDED_TYPES;
}

function buildNewSearchState({ q, now, latNum, lngNum, rNum, perPageNum, cursorId }) {
  const activityTypeNorm = q.activityType ?? null;
  const quickFilterNorm = q.quickFilter ?? null;
  const placeCategory = q.placeCategory ?? null;

  const budgetNorm = normalizeBudget(q.budget ?? null);
  const includeUnpriced = typeof q.includeUnpriced === "boolean" ? q.includeUnpriced : true;

  const whoNorm = normalizeWho(q.who);
  const whoProfile = buildWhoProfile({ who: whoNorm, placeCategory });

  const targetAt = parseWhenAtISO(q.whenAtISO) || now;
  const timeCtx = normalizeTimeCtx(q);

  const keywordText = String(q.keyword || "").trim();
  const useKeyword = !!keywordText;

  // --- NEW: v1 nearby plan returns grouped includedTypes + keyword-ish fallback text query ---
  const plan = buildV1NearbyPlan({
    activityType: activityTypeNorm,
    quickFilter: quickFilterNorm,
    placeCategory,
    diningMode: q.diningMode ?? null,
    placesFilters: q.placesFilters,
  });

  // Build nearby streams (PRIMARY)
  const nearbyStreams = (Array.isArray(plan.nearbyTypeGroups) ? plan.nearbyTypeGroups : [])
    .filter((g) => Array.isArray(g) && g.length)
    .map((includedTypes) => ({
      kind: "nearby",
      stage: "primary", // staged execution: nearby first
      includedTypes,
      maxResultCount: 20,
    }));

  // User keyword: treat as PRIMARY (high intent)
  const primaryTextStream = useKeyword
    ? [{
        kind: "text",
        stage: "primary",
        textQuery: keywordText,
      }]
    : [];

  // Config keyword hints: treat as FALLBACK (run only if underfilled)
  const fallbackTextStream = (!useKeyword && plan.textFallbackQuery)
    ? [{
        kind: "text",
        stage: "fallback",
        textQuery: plan.textFallbackQuery,
      }]
    : [];

  const streams = [
    ...nearbyStreams,
    ...primaryTextStream,
    ...fallbackTextStream,
  ];

  if (!streams.length) {
    return {
      error: {
        status: 400,
        message: "Missing search selector: send quickFilter, activityType, placeCategory, or keyword",
      },
    };
  }

  const maxTier = budgetToMaxTier(budgetNorm);
  const excludedTypes = buildExcludedTypesForActivity({ activityType: activityTypeNorm, placeCategory });

  const rankPreference = shouldRankByDistance({
    activityType: activityTypeNorm,
    quickFilter: quickFilterNorm,
  })
    ? "DISTANCE"
    : null;

  // canonicalized values used in both the stored query + hashes
  const vibesNorm = Array.isArray(q.vibes) ? q.vibes.filter(Boolean).slice(0, 2) : null;
  const placesFiltersNorm = q.placesFilters && typeof q.placesFilters === "object" ? q.placesFilters : null;

  // Hash whenAtISO only if user explicitly provided it; otherwise you break cache/debug by hashing "now"
  const userProvidedWhen =
    typeof q.whenAtISO === "string" && q.whenAtISO.trim().length > 0;

  const whenAtISOForHash = userProvidedWhen ? targetAt.toISOString() : null;

  // 1) Client-intent hash (cursor immutability)
  const clientQueryHash =
    (typeof q.queryHash === "string" && q.queryHash.length ? q.queryHash : null) ||
    hashClientQuery({
      lat: latNum,
      lng: lngNum,
      radiusMeters: rNum,
      activityType: activityTypeNorm,
      quickFilter: quickFilterNorm,
      placeCategory,
      budget: budgetNorm,
      includeUnpriced,
      keyword: useKeyword ? keywordText : null,
      vibes: vibesNorm,
      placesFilters: placesFiltersNorm,
      familyFriendly: !!q.familyFriendly,
      who: whoNorm,
      whenAtISO: whenAtISOForHash,
      timeZone: timeCtx.timeZone,
      tzOffsetMinutes: timeCtx.tzOffsetMinutes,
      mode: q.mode ?? null,
      eventCategory: q.eventCategory ?? null,
      eventFilters: q.eventFilters ?? null,
    });

  // 2) Engine hash (debug/caching)
  const engineHash = hashEngineStable({
    lat: latNum,
    lng: lngNum,
    radiusMeters: rNum,
    perPage: perPageNum,
    activityType: activityTypeNorm,
    quickFilter: quickFilterNorm,
    placeCategory,
    budget: budgetNorm,
    includeUnpriced,
    maxTier: maxTier ?? null,
    excludedTypes: ensureArray(excludedTypes).slice().sort(),
    rankPreference,
    keyword: useKeyword ? keywordText : null,
    vibes: vibesNorm,
    placesFilters: placesFiltersNorm,
    familyFriendly: !!q.familyFriendly,
    who: whoNorm,
    whenAtISO: targetAt.toISOString(), // execution truth
    timeZone: timeCtx.timeZone,
    tzOffsetMinutes: timeCtx.tzOffsetMinutes,

    // NEW: include derived fallback query for debug determinism
    textFallbackQuery: !useKeyword ? (plan.textFallbackQuery || null) : null,
  });

  const comboMeta = streams.map((s) => {
    if (s.kind === "nearby") {
      return { fetched: false, exhausted: false };
    }
    if (s.kind === "text") {
      return { nextPageToken: null, exhausted: false };
    }
    return { exhausted: true };
  });

  const state = {
    cursorId,

    query: {
      lat: latNum,
      lng: lngNum,
      radiusMeters: rNum,
      activityType: activityTypeNorm,
      quickFilter: quickFilterNorm,
      placeCategory,
      budget: budgetNorm,
      includeUnpriced,
      keyword: useKeyword ? keywordText : null,
      vibes: vibesNorm,
      placesFilters: placesFiltersNorm,
      familyFriendly: !!q.familyFriendly,
      whenAtISO: targetAt.toISOString(),
      timeZone: timeCtx.timeZone,
      tzOffsetMinutes: timeCtx.tzOffsetMinutes,
      who: whoNorm,
      when: q.when ?? null,

      reqId: q.reqId ?? null,
      debug: !!q.debug,
    },

    queryHash: clientQueryHash,
    engineHash,

    originLat: latNum,
    originLng: lngNum,
    radiusMeters: rNum,

    activityType: activityTypeNorm,
    quickFilter: quickFilterNorm,
    placeCategory,

    includeUnpriced,
    maxTier,
    excludedTypes,
    rankPreference,

    whoNorm,
    whoProfile,

    targetAtISO: targetAt.toISOString(),
    timeCtx,

    // streams + meta
    combos: streams,
    comboMeta,

    // staged execution: fallback streams are ignored until armed
    fallbackArmed: false,

    cursorIndex: 0,
    pending: [],
    seenIds: [],
    totals: null,

    createdAtISO: new Date().toISOString(),
    updatedAtISO: new Date().toISOString(),
    pageNo: 0,
    version: 0,
    audit: [],
    lastServedAtISO: null,
    lastServedReqId: null,
  };

  return { state, queryHash: clientQueryHash, streams };
}

module.exports = { buildNewSearchState };
