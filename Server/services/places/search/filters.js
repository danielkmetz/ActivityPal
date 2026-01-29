const { isFastFood } = require("../../../utils/isFastFood");
const { haversineDistance } = require("../../../utils/haversineDistance");
const {
  hardExcludedTypes,
  softExcludedTypes,
  foodSignalTypes,
  gasStationNamePattern,
  countryClubNamePattern,
} = require("./filterConfig");

function safeNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function safeStr(s) {
  const out = String(s || "").trim();
  return out ? out : "";
}

function safeBool(b) {
  return typeof b === "boolean" ? b : null;
}

function safeRating(r) {
  const x = Number(r);
  return Number.isFinite(x) ? x : null;
}

function getTypes(rawPlace) {
  return Array.isArray(rawPlace?.types) ? rawPlace.types : [];
}

function getQueryFromState(state, opts) {
  const q = opts?.query || state?.query || null;
  return q && typeof q === "object" ? q : {};
}

function getPlacesFilters(state, q) {
  // support both new world (q.placesFilters) and transitional (state.placesFilters)
  const pf = q?.placesFilters && typeof q.placesFilters === "object" ? q.placesFilters : null;
  if (pf) return pf;

  const sf = state?.placesFilters && typeof state.placesFilters === "object" ? state.placesFilters : null;
  return sf;
}

function budgetRejects(budget, price_level) {
  if (!budget) return false;

  const pl = Number.isFinite(Number(price_level)) ? Number(price_level) : null;
  if (pl == null) return false;

  if (budget === "$") return pl > 1;
  if (budget === "$$") return pl > 2;
  if (budget === "$$$") return pl > 3;
  if (budget === "$$$$") return pl > 4;
  return false;
}

function isBarOrNightlife(types) {
  // “bar” and “night_club” are the big ones
  return types.includes("bar") || types.includes("night_club");
}

/**
 * Best-effort chain detection.
 * Google Nearby Search doesn’t label “chain”.
 * If you want this accurate, you need:
 *  - a real chain list, or
 *  - your own business DB / ML classifier
 */
const DEFAULT_CHAIN_PATTERNS = [
  /Starbucks/i,
  /McDonald'?s/i,
  /Chick-?fil-?A/i,
  /Taco Bell/i,
  /Wendy'?s/i,
  /Burger King/i,
  /Subway/i,
  /Dunkin/i,
  /Panera/i,
  /Chipotle/i,
  /Domino'?s/i,
  /Pizza Hut/i,
  /KFC/i,
];

function isLikelyChainName(name) {
  const n = safeStr(name);
  if (!n) return false;
  return DEFAULT_CHAIN_PATTERNS.some((re) => re.test(n));
}

function shouldExcludeFastFood(rawPlace, state, parseDiningMode) {
  // keep your existing semantics
  if (state?.activityType !== "Dining") return false;
  if (parseDiningMode(state?.diningMode) === "quick_bite") return false;

  const name = rawPlace?.name || "";
  const types = getTypes(rawPlace);
  const hasFoodSignal = types.some((t) => foodSignalTypes.has(t));
  if (!hasFoodSignal) return false;

  return isFastFood(name);
}

function shouldExcludeByOpenNowOnly(rawPlace, placesFilters) {
  if (!placesFilters?.openNowOnly) return false;

  const openNow = safeBool(rawPlace?.opening_hours?.open_now);

  // strict: if user requires open now and we don’t know, reject
  if (openNow !== true) return true;

  return false;
}

function shouldExcludeByMinRating(rawPlace, placesFilters) {
  const min = placesFilters?.minRating;
  if (typeof min !== "number") return false;

  const r = safeRating(rawPlace?.rating);
  // strict: if min rating set and rating missing, reject
  if (r == null) return true;

  return r < min;
}

function shouldExcludeByAvoidBars(rawPlace, placesFilters) {
  if (!placesFilters?.avoid?.bars) return false;
  const types = getTypes(rawPlace);
  return isBarOrNightlife(types);
}

function shouldExcludeByAvoidChains(rawPlace, placesFilters) {
  if (!placesFilters?.avoid?.chains) return false;

  // best effort only — don’t pretend this is perfect
  const name = rawPlace?.name || "";
  return isLikelyChainName(name);
}

function shouldExcludeByFamilyFriendly(rawPlace, q, placesFilters) {
  if (!q?.familyFriendly) return false;

  // Family-friendly is effectively a stricter “avoid nightlife”
  const types = getTypes(rawPlace);

  if (types.includes("night_club") || types.includes("casino") || types.includes("adult_entertainment")) {
    return true;
  }

  // also treat bars as non-family-friendly unless your product says otherwise
  if (isBarOrNightlife(types)) return true;

  // could also exclude liquor_store if it ever leaks in
  if (types.includes("liquor_store")) return true;

  return false;
}

function evaluatePlace(rawPlace, state, { parseDiningMode, query } = {}) {
  const reasons = [];

  const q = getQueryFromState(state, { query });
  const placesFilters = getPlacesFilters(state, q);

  const name = rawPlace?.name || "";
  const types = getTypes(rawPlace);

  // ---- existing hard/soft excludes ----
  const hardHit = types.find((t) => hardExcludedTypes.has(t));
  if (hardHit) reasons.push(`excludedType:${hardHit}`);

  const hasSoft = types.some((t) => softExcludedTypes.has(t));
  const hasFoodSignal = types.some((t) => foodSignalTypes.has(t));
  if (hasSoft && !hasFoodSignal) reasons.push("excludedType:store");

  if (gasStationNamePattern.test(name)) reasons.push("excludedGasName");
  if (countryClubNamePattern.test(name)) reasons.push("excludedCountryClub");

  // ---- new prefs we can actually enforce from Nearby Search ----
  if (shouldExcludeByOpenNowOnly(rawPlace, placesFilters)) reasons.push("excludedOpenNow");
  if (shouldExcludeByMinRating(rawPlace, placesFilters)) reasons.push("excludedMinRating");
  if (shouldExcludeByAvoidBars(rawPlace, placesFilters)) reasons.push("excludedBars");
  if (shouldExcludeByAvoidChains(rawPlace, placesFilters)) reasons.push("excludedChains");

  if (shouldExcludeByFamilyFriendly(rawPlace, q, placesFilters)) reasons.push("excludedFamilyFriendly");

  // ---- keep your Dining fast-food rules ----
  if (shouldExcludeFastFood(rawPlace, state, parseDiningMode)) reasons.push("excludedFastFood");

  // ---- budget (pull from q first, fallback to state) ----
  const budget = q?.budget ?? state?.budget ?? null;
  if (budget && budgetRejects(budget, rawPlace?.price_level)) reasons.push("excludedBudget");

  // ---- geo + radius ----
  const pLat = safeNum(rawPlace?.geometry?.location?.lat);
  const pLng = safeNum(rawPlace?.geometry?.location?.lng);
  if (pLat == null || pLng == null) {
    reasons.push("missingGeo");
    return { ok: false, reasons, pLat, pLng, distMeters: null };
  }

  const distMeters = haversineDistance(state.originLat, state.originLng, pLat, pLng);
  if (!Number.isFinite(distMeters)) {
    reasons.push("badDistance");
  } else if (Number.isFinite(state.radiusMeters) && distMeters > state.radiusMeters) {
    reasons.push("outsideRadius");
  }

  return { ok: reasons.length === 0, reasons, pLat, pLng, distMeters };
}

module.exports = {
  safeNum,
  budgetRejects,
  evaluatePlace,
};
