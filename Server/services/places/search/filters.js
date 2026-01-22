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

function shouldExcludeFastFood(rawPlace, state, parseDiningMode) {
  if (state?.activityType !== "Dining") return false;
  if (parseDiningMode(state?.diningMode) === "quick_bite") return false;

  const name = rawPlace?.name || "";
  const types = Array.isArray(rawPlace?.types) ? rawPlace.types : [];
  const hasFoodSignal = types.some((t) => foodSignalTypes.has(t));
  if (!hasFoodSignal) return false;

  return isFastFood(name);
}

function evaluatePlace(rawPlace, state, { parseDiningMode }) {
  const reasons = [];
  const name = rawPlace?.name || "";
  const types = Array.isArray(rawPlace?.types) ? rawPlace.types : [];

  const hardHit = types.find((t) => hardExcludedTypes.has(t));
  if (hardHit) reasons.push(`excludedType:${hardHit}`);

  const hasSoft = types.some((t) => softExcludedTypes.has(t));
  const hasFoodSignal = types.some((t) => foodSignalTypes.has(t));
  if (hasSoft && !hasFoodSignal) reasons.push("excludedType:store");

  if (gasStationNamePattern.test(name)) reasons.push("excludedGasName");
  if (countryClubNamePattern.test(name)) reasons.push("excludedCountryClub");

  if (shouldExcludeFastFood(rawPlace, state, parseDiningMode)) reasons.push("excludedFastFood");
  if (state?.budget && budgetRejects(state.budget, rawPlace?.price_level)) reasons.push("excludedBudget");

  const pLat = safeNum(rawPlace?.geometry?.location?.lat);
  const pLng = safeNum(rawPlace?.geometry?.location?.lng);
  if (pLat == null || pLng == null) {
    reasons.push("missingGeo");
    return { ok: false, reasons, pLat, pLng, distMeters: null };
  }

  const distMeters = haversineDistance(state.originLat, state.originLng, pLat, pLng);
  if (!Number.isFinite(distMeters)) {
    reasons.push("badDistance");
  } else if (distMeters > state.radiusMeters) {
    reasons.push("outsideRadius");
  }

  return { ok: reasons.length === 0, reasons, pLat, pLng, distMeters };
}

module.exports = { safeNum, budgetRejects, evaluatePlace };
