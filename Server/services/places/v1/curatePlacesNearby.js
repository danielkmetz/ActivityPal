const pLimitPkg = require("p-limit");
const pLimit = pLimitPkg.default || pLimitPkg;

const { haversineDistance } = require("../../../utils/haversineDistance");
const {
  hydratePlacesWithPromosEvents,
  sortPlacesByPromoThenDistance,
} = require("../../../utils/PromosEvents/hydratePromosEvents");

const {
  EXCLUDED_TYPES,
  PRICE_LEVEL_TO_TIER,
  budgetToMaxTier,
  buildSearchCombos,
} = require("./config");

const { fetchNearbyPlacesV1 } = require("./nearbySearchClient");

// ✅ Adjust this path if your folders differ.
// If this file is: services/places/nearby/v1/..., then ../filters is wrong.
// It should be: ../../filters/dateNightFilter
const { isDateNightReject } = require("../filters/dateNightFilter");

const countryClubNamePattern = /Country Club|Golf Course|Golf Club|Links/i;

function normalizePriceTier(priceLevel) {
  if (typeof priceLevel === "string") return PRICE_LEVEL_TO_TIER[priceLevel] ?? null;
  if (typeof priceLevel === "number") return priceLevel;
  return null;
}

function buildExcludedTypesForActivity(activityType) {
  // preserve your existing special-case
  return activityType === "Dining"
    ? EXCLUDED_TYPES.filter((t) => t !== "meal_takeaway")
    : EXCLUDED_TYPES;
}

function toCuratedPlace({ place, originLat, originLng, radiusMeters }) {
  const loc = place?.location;
  if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return null;

  const distanceMeters = haversineDistance(originLat, originLng, loc.latitude, loc.longitude);
  if (!Number.isFinite(distanceMeters)) return null;
  if (distanceMeters > radiusMeters) return null;

  const name = place?.displayName?.text || "";
  if (countryClubNamePattern.test(name)) return null;

  const photoName = place?.photos?.[0]?.name || null;

  return {
    name: name || null,
    types: Array.isArray(place?.types) ? place.types : [],
    address: place?.shortFormattedAddress || null,

    // your app uses place_id internally
    place_id: place?.id || null,

    photoName,
    photoUrl: null,

    distance: +(distanceMeters / 1609.34).toFixed(2),
    location: { lat: loc.latitude, lng: loc.longitude },

    petFriendly: typeof place?.allowsDogs === "boolean" ? place.allowsDogs : null,
    openingHours: place?.regularOpeningHours || null,
    openNow:
      typeof place?.currentOpeningHours?.openNow === "boolean"
        ? place.currentOpeningHours.openNow
        : null,

    promotions: [],
    events: [],
    _peHydrated: false,
  };
}

async function getCuratedPlacesNearbyV1({
  apiKey,
  activityType,
  quickFilter,
  lat,
  lng,
  radiusMeters,
  budget,
  page = 1,
  perPage = 15,
  includeUnpriced = true,
  concurrency = 4,
  now = new Date(),
  log = null,
}) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const rNum = Number(radiusMeters);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return { error: { status: 400, message: "Invalid lat/lng" } };
  }
  if (!Number.isFinite(rNum) || rNum <= 0 || rNum > 50000) {
    return {
      error: {
        status: 400,
        message: "Invalid radius (meters). Must be 0 < radius <= 50000",
      },
    };
  }

  const pageNum = Math.max(1, Number(page || 1));
  const perPageNum = Math.min(25, Math.max(5, Number(perPage || 15)));

  const combos = buildSearchCombos({ activityType, quickFilter });
  const uniqueTypes = Array.from(new Set(combos.map((x) => x?.type).filter(Boolean)));

  if (!uniqueTypes.length) {
    return { curatedPlaces: [], meta: { page: pageNum, perPage: perPageNum, total: 0 } };
  }

  const maxTier = budgetToMaxTier(budget);
  const excludedTypes = buildExcludedTypesForActivity(activityType);

  const limit = pLimit(concurrency);
  const resultsArrays = await Promise.all(
    uniqueTypes.map((type) =>
      limit(() =>
        fetchNearbyPlacesV1({
          apiKey,
          lat: latNum,
          lng: lngNum,
          radiusMeters: rNum,
          type,
          excludedTypes,
          log,
        }).catch(() => [])
      )
    )
  );

  // Dedupe by place.id
  const byId = new Map();
  for (const arr of resultsArrays) {
    for (const place of Array.isArray(arr) ? arr : []) {
      if (place?.id && !byId.has(place.id)) byId.set(place.id, place);
    }
  }

  // Filter + normalize
  const curated = [];
  for (const place of byId.values()) {
    // ✅ Date night filtering (new Places API uses displayName.text)
    if (quickFilter === "dateNight") {
      const { reject } = isDateNightReject({
        name: place?.displayName?.text || place?.name || "",
        types: Array.isArray(place?.types) ? place.types : [],
      });
      if (reject) continue;
    }

    const tier = normalizePriceTier(place?.priceLevel);
    const priceOk =
      maxTier == null ||
      (includeUnpriced && tier == null) ||
      (tier != null && tier <= maxTier);

    if (!priceOk) continue;

    const mapped = toCuratedPlace({
      place,
      originLat: latNum,
      originLng: lngNum,
      radiusMeters: rNum,
    });

    if (!mapped || !mapped.place_id) continue;

    curated.push(mapped);
  }

  // Baseline stable sort (distance) before hydration
  curated.sort((a, b) => a.distance - b.distance);

  // Hydrate promos/events then prioritize
  const { hydrated } = await hydratePlacesWithPromosEvents({ places: curated, now });
  const prioritized = sortPlacesByPromoThenDistance(Array.isArray(hydrated) ? hydrated : curated);

  // paginate after promo sort
  const start = (pageNum - 1) * perPageNum;
  const paged = prioritized.slice(start, start + perPageNum);

  return {
    curatedPlaces: paged,
    meta: {
      page: pageNum,
      perPage: perPageNum,
      total: prioritized.length,
      uniqueTypes: uniqueTypes.length,
      uniquePlaces: byId.size,
    },
  };
}

module.exports = { getCuratedPlacesNearbyV1 };
