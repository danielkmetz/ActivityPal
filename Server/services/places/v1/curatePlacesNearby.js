const pLimitPkg = require("p-limit");
const pLimit = pLimitPkg.default || pLimitPkg;
const { haversineDistance } = require("../../../utils/haversineDistance");
const { hydratePlacesWithPromosEvents, sortPlacesByPromoThenDistance } = require("../../../utils/PromosEvents/hydratePromosEvents");
const { EXCLUDED_TYPES, PRICE_LEVEL_TO_TIER, budgetToMaxTier } = require("./config");
const { fetchPlacesTextV1 } = require('./textSearchClient');
const { buildSearchCombos, shouldRankByDistance } = require("../search/combos");
const { fetchNearbyPlacesV1 } = require("./nearbySearchClient");
const { isDateNightReject } = require("../filters/dateNightFilter");
const { parseWhenAtISO, isOpenAtTarget } = require('../../../utils/places/timeHelpers');

const countryClubNamePattern = /Country Club|Golf Course|Golf Club|Links/i;

function normalizePriceTier(priceLevel) {
  if (typeof priceLevel === "string") return PRICE_LEVEL_TO_TIER[priceLevel] ?? null;
  if (typeof priceLevel === "number") return priceLevel;
  return null;
}

function buildExcludedTypesForActivity({ activityType, placeCategory }) {
  const t = activityType || placeCategory || null;
  return t === "Dining"
    ? EXCLUDED_TYPES.filter((x) => x !== "meal_takeaway")
    : EXCLUDED_TYPES;
}

function normalizeBudget(budget) {
  const b = typeof budget === "string" ? budget.trim() : null;
  if (!b || b.toLowerCase() === "any") return null;
  if (b === "$" || b === "$$" || b === "$$$" || b === "$$$$") return b;
  return null;
}

function normalizePlacesFilters(raw) {
  return raw && typeof raw === "object" ? raw : {};
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
    goodForChildren:
      typeof place?.goodForChildren === "boolean"
        ? place.goodForChildren
        : null,
    promotions: [],
    events: [],
    _peHydrated: false,
  };
}

function passesPlacesFilters({ place, query, targetAt, timeCtx }) {
  const filters = normalizePlacesFilters(query?.placesFilters);

  // Treat openNowOnly as "open at the selected time" (because you *cannot* reliably do future openNow via Google)
  if (filters.openNowOnly) {
    const openAt = isOpenAtTarget({ place, targetAt, timeCtx });
    if (openAt !== true) return false;
  }

  if (filters.petFriendlyOnly) {
    const allowsDogs = typeof place?.allowsDogs === "boolean" ? place.allowsDogs : null;
    if (allowsDogs !== true) return false;
  }

  if (query?.familyFriendly) {
    const goodForChildren = typeof place?.goodForChildren === "boolean" ? place.goodForChildren : null;
    if (goodForChildren === false) return false;
  }

  return true;
}

async function getCuratedPlacesNearbyV1({
  query,
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
} = {}) {
  const q = query && typeof query === "object" ? query : null;

  const targetAt = parseWhenAtISO(q?.whenAtISO) || now;
  const timeCtx = {
    timeZone: q?.timeZone || null,              // e.g. "America/Chicago"
    tzOffsetMinutes: q?.tzOffsetMinutes ?? null // e.g. -360 for CST
  };

  const latNum = Number(q?.lat ?? lat);
  const lngNum = Number(q?.lng ?? lng);
  const rNum = Number(q?.radius ?? radiusMeters);
  const activityTypeNorm = q?.activityType ?? activityType ?? null;
  const quickFilterNorm = q?.quickFilter ?? quickFilter ?? null;
  const placeCategory = q?.placeCategory ?? null;

  const pageNum = Math.max(1, Number(q?.page ?? page ?? 1));
  const perPageNum = Math.min(25, Math.max(5, Number(q?.perPage ?? perPage ?? 15)));

  const budgetNorm = normalizeBudget(q?.budget ?? budget);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return { error: { status: 400, message: "Invalid lat/lng" } };
  }

  if (!Number.isFinite(rNum) || rNum <= 0 || rNum > 50000) {
    return {
      error: { status: 400, message: "Invalid radius (meters). Must be 0 < radius <= 50000" },
    };
  }

  const combos = buildSearchCombos({
    provider: "v1Nearby",
    activityType: activityTypeNorm,
    quickFilter: quickFilterNorm,
    placeCategory,
    keyword: q?.keyword,
    vibes: q?.vibes,
    placesFilters: q?.placesFilters,
  });

  const uniqueTypes = Array.from(new Set((combos || []).map((x) => x?.type).filter(Boolean)));

  if (!uniqueTypes.length) {
    return {
      error: {
        status: 400,
        message: "Missing search selector: send quickFilter, activityType, or placeCategory",
      },
    };
  }

  const maxTier = budgetToMaxTier(budgetNorm);
  const excludedTypes = buildExcludedTypesForActivity({ activityType: activityTypeNorm, placeCategory });

  const keywordText = String(q?.keyword || "").trim();
  const useKeyword = !!keywordText;

  const rankPreference = shouldRankByDistance({
    activityType: activityTypeNorm,
    quickFilter: quickFilterNorm,
  })
    ? "DISTANCE"
    : null;

  const limit = pLimit(concurrency);

  const nearbyArrays = await Promise.all(
    uniqueTypes.map((type) =>
      limit(async () => {
        try {
          const res = await fetchNearbyPlacesV1({
            apiKey,
            lat: latNum,
            lng: lngNum,
            radiusMeters: rNum,
            type,
            excludedTypes,
            rankPreference,
            log,
          });
          return Array.isArray(res) ? res : [];
        } catch {
          return [];
        }
      })
    )
  );

  let textPlaces = [];
  if (useKeyword) {
    textPlaces = await fetchPlacesTextV1({
      apiKey,
      textQuery: keywordText,          // this is the whole point :contentReference[oaicite:3]{index=3}
      lat: latNum,
      lng: lngNum,
      radiusMeters: rNum,
      maxResultCount: 20,
    }).catch(() => []);
  }

  const resultsArrays = [...nearbyArrays, textPlaces];

  const byId = new Map();
  for (const arr of resultsArrays) {
    for (const place of Array.isArray(arr) ? arr : []) {
      if (place?.id && !byId.has(place.id)) byId.set(place.id, place);
    }
  }

  const curated = [];
  for (const place of byId.values()) {

    const placeTypes = Array.isArray(place?.types) ? place.types : [];
    if (Array.isArray(excludedTypes) && excludedTypes.some((t) => placeTypes.includes(t))) {
      continue;
    }

    if (quickFilterNorm === "dateNight") {
      const { reject } = isDateNightReject({
        name: place?.displayName?.text || place?.name || "",
        types: Array.isArray(place?.types) ? place.types : [],
      });
      if (reject) continue;
    }

    const openAtTarget = isOpenAtTarget({ place, targetAt, timeCtx });

    if (!passesPlacesFilters({ place, query: q || {} })) continue;

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

    mapped.openAtTarget = openAtTarget;

    curated.push(mapped);
  }

  curated.sort((a, b) => {
    const d = a.distance - b.distance;
    if (d) return d;
    return String(a.place_id).localeCompare(String(b.place_id));
  });

  const { hydrated } = await hydratePlacesWithPromosEvents({ places: curated, now: targetAt });
  const prioritized = sortPlacesByPromoThenDistance(Array.isArray(hydrated) ? hydrated : curated);

  function promoCount(p) {
    const promos = Array.isArray(p?.promotions) ? p.promotions.length : 0;
    const events = Array.isArray(p?.events) ? p.events.length : 0;
    return promos + events;
  }

  prioritized.sort((a, b) => {
    const ao = a.openAtTarget === true ? 0 : a.openAtTarget === false ? 2 : 1;
    const bo = b.openAtTarget === true ? 0 : b.openAtTarget === false ? 2 : 1;
    if (ao !== bo) return ao - bo;

    const ap = promoCount(a);
    const bp = promoCount(b);
    if (ap !== bp) return bp - ap;

    if (a.distance !== b.distance) return a.distance - b.distance;
    return String(a.place_id).localeCompare(String(b.place_id));
  });

  const start = (pageNum - 1) * perPageNum;
  const paged = prioritized.slice(start, start + perPageNum);
  const hasMore = start + perPageNum < prioritized.length;

  return {
    curatedPlaces: paged,
    meta: {
      page: pageNum,
      perPage: perPageNum,
      total: prioritized.length,
      hasMore,
      cursor: null,
      provider: "places2",
      uniqueTypes: uniqueTypes.length,
      uniquePlaces: byId.size,
    },
  };
}

module.exports = { getCuratedPlacesNearbyV1 };
