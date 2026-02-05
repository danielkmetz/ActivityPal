const { normalizePlacesFilters, normalizePriceTier } = require("../query/queryNormalization");
const { canComputeOpenAt, effectiveTimeCtxForPlace } = require("./timeContext");
const { toCuratedPlace } = require("../search/placeMapping");
const { isDateNightReject } = require("./dateNightFilter");
const { isOpenAtTarget } = require("../../../utils/places/timeHelpers");
const { passesWhoGuardrails, scorePlaceForWho } = require("../../../utils/places/curation/whoProfile");

function passesPlacesFilters({ place, query, targetAt, timeCtx, openAtTarget }) {
  const filters = normalizePlacesFilters(query?.placesFilters);

  if (filters.openNowOnly) {
    if (!canComputeOpenAt(timeCtx)) return false;

    const openAt = typeof openAtTarget === "boolean"
      ? openAtTarget
      : isOpenAtTarget({ place, targetAt, timeCtx });

    if (openAt !== true) return false;
  }

  if (filters.dogFriendly) {
    const allowsDogs = typeof place?.allowsDogs === "boolean" ? place.allowsDogs : null;
    if (allowsDogs !== true) return false;
  }

  if (query?.familyFriendly) {
    const goodForChildren = typeof place?.goodForChildren === "boolean" ? place.goodForChildren : null;
    if (goodForChildren === false) return false;
  }

  return true;
}

/**
 * Evaluate a raw Google place against all rules and return a mapped curated place if it passes.
 * Returns:
 *   { ok: true, mapped, openAtTarget, whoScore }
 *   { ok: false, reason }
 */
function evaluateCandidatePlace({ place, state, targetAt, baseTimeCtx }) {
  const placeTypes = Array.isArray(place?.types) ? place.types : [];

  // excludedTypes
  if (Array.isArray(state.excludedTypes) && state.excludedTypes.some((t) => placeTypes.includes(t))) {
    return { ok: false, reason: "excludedType" };
  }

  // dateNight name/type reject
  if (state.quickFilter === "dateNight") {
    const { reject } = isDateNightReject({
      name: place?.displayName?.text || place?.name || "",
      types: placeTypes,
    });
    if (reject) return { ok: false, reason: "dateNightReject" };
  }

  const effTimeCtx = effectiveTimeCtxForPlace(baseTimeCtx, place);

  const openAtTarget = canComputeOpenAt(effTimeCtx)
    ? isOpenAtTarget({ place, targetAt, timeCtx: effTimeCtx })
    : null;

  if (
    !passesPlacesFilters({
      place,
      query: state.query,
      targetAt,
      timeCtx: effTimeCtx,
      openAtTarget,
    })
  ) {
    return { ok: false, reason: "placesFiltersReject" };
  }

  if (!passesWhoGuardrails(place, state.whoProfile)) {
    return { ok: false, reason: "whoGuardrailReject" };
  }

  const whoScore = scorePlaceForWho(place, state.whoProfile);

  // budget
  const tier = normalizePriceTier(place?.priceLevel);
  const maxTier = state.maxTier;
  const priceOk =
    maxTier == null ||
    (state.includeUnpriced && tier == null) ||
    (tier != null && tier <= maxTier);

  if (!priceOk) return { ok: false, reason: "excludedBudget" };

  // map + radius + country club check happen inside toCuratedPlace
  const mapped = toCuratedPlace({
    place,
    originLat: state.originLat,
    originLng: state.originLng,
    radiusMeters: state.radiusMeters,
  });

  if (!mapped || !mapped.place_id) return { ok: false, reason: "mapReject" };

  mapped.openAtTarget = openAtTarget;
  mapped.whoScore = whoScore;

  return { ok: true, mapped, openAtTarget, whoScore };
}

module.exports = { passesPlacesFilters, evaluateCandidatePlace };
