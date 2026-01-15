const express = require("express");
const axios = require("axios");
const router = express.Router();
const Business = require('../models/Business');
const { Post } = require('../models/Post');           // ✅ unified Post model
const User = require('../models/User');
const { enrichBusinessWithPromosAndEvents } = require("../utils/enrichBusinesses");
const { haversineDistance } = require('../utils/haversineDistance');
const pLimit = require("p-limit").default;
const Event = require('../models/Events');
const Promotion = require('../models/Promotions');
const { hydratePlacesWithPromosEvents, sortPlacesByPromoThenDistance } = require("../utils/PromosEvents/hydratePromosEvents");

const googleApiKey = process.env.GOOGLE_PLACES2;
const PLACES_DEBUG = "2" === "1";

const MAX_DISTANCE_METERS = 8046.72; // 5 miles

const dlog = (...args) => {
  if (PLACES_DEBUG) console.log("[places-nearby]", ...args);
};

const PHOTO_URL_TTL_MS = 1000 * 60 * 30; // 30 min (tune this)
const photoCache = new Map(); // key -> { url, exp }

// basic cache helpers
function cacheGet(key) {
  const hit = photoCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    photoCache.delete(key);
    return null;
  }
  return hit.url;
}
function cacheSet(key, url) {
  photoCache.set(key, { url, exp: Date.now() + PHOTO_URL_TTL_MS });
}


const quickFilters = {
  dateNight: [
    { type: 'amusement_center' },
    { type: 'movie_theater' },
    { type: 'restaurant' },
    { type: 'bar' },
    { type: 'bowling_alley' },
  ],
  drinksAndDining: [{ type: 'restaurant' }, { type: 'bar' }, { type: 'cafe' }],
  outdoor: [{ type: 'park' }, { type: 'natural_feature' }, { type: 'campground' }, { type: 'tourist_attraction' }],
  movieNight: [{ type: 'movie_theater' }],
  gaming: [{ type: 'amusement_center' }, { type: 'bowling_alley' }],
  artAndCulture: [{ type: 'museum' }, { type: 'art_gallery' }],
  familyFun: [
    { type: 'amusement_park' }, { type: 'zoo' }, { type: 'aquarium' },
    { type: 'amusement_center' }, { type: 'museum' }, { type: 'playground' }
  ],
  petFriendly: [{ type: 'park' }],
  liveMusic: [{ type: 'bar' }, { type: 'night_club' }],
  whatsClose: [{ type: 'establishment' }]
};

const activityTypeKeywords = {
  Dining: ["restaurant", "bar", "meal_delivery", "meal_takeaway", "cafe"],
  Entertainment: ["movie_theater", "bowling_alley", "amusement_center", "topgolf", "amusement_center"],
  Outdoor: ["park", "tourist_attraction", "campground", "zoo", "natural_feature"],
  Indoor: ["bowling_alley", "museum", "aquarium", "art_gallery", "movie_theater", "amusement_center"],
  Family: ["zoo", "aquarium", "museum", "park", "amusement_park", "playground", "amusement_center"],
};

const EXCLUDED_TYPES = [
  "school", "doctor", "hospital", "lodging", "airport", "store", "storage",
  "golf_course", "meal_takeaway", "casino",
];

const PRICE_LEVEL_TO_TIER = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
  PRICE_LEVEL_UNSPECIFIED: null,
};

function budgetToMaxTier(budget) {
  if (budget === "$") return 1;
  if (budget === "$$") return 2;
  if (budget === "$$$") return 3;
  if (budget === "$$$$") return 4;
  return null; // no budget filter
}

function roundCoord(n) {
  return typeof n === "number" ? Math.round(n * 10000) / 10000 : n;
}

function safeName(s) {
  const t = String(s || "").trim();
  return t.length > 60 ? t.slice(0, 57) + "..." : t;
}

async function fetchNearbyPlaces({ lat, lng, radiusMeters, type, excludedTypes }) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const body = {
    includedTypes: [type],
    excludedTypes: excludedTypes || [],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Number(radiusMeters),
      },
    },
    // rankPreference: "DISTANCE", // optional; good for “what’s close”
  };

  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.types",
    "places.primaryType",
    "places.location",
    "places.shortFormattedAddress",
    "places.photos",
    "places.priceLevel",
    "places.allowsDogs",
    "places.currentOpeningHours",
    "places.regularOpeningHours",
  ].join(",");

  dlog(`[${reqId}] request`, {
    type,
    excludedCount: body.excludedTypes.length,
    radiusMeters: body.locationRestriction.circle.radius,
    lat: roundCoord(lat),
    lng: roundCoord(lng),
    fieldMask,
  });

  try {
    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchNearby",
      body,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleApiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        timeout: 15000,
      }
    );

    const places = response?.data?.places || [];

    // Field presence diagnostics
    let hasAllowsDogs = 0;
    let hasRegularOH = 0;
    let hasCurrentOH = 0;
    let hasOpenNow = 0;

    for (const p of places) {
      if (typeof p?.allowsDogs === "boolean") hasAllowsDogs += 1;
      if (p?.regularOpeningHours) hasRegularOH += 1;
      if (p?.currentOpeningHours) hasCurrentOH += 1;
      if (typeof p?.currentOpeningHours?.openNow === "boolean") hasOpenNow += 1;
    }

    dlog(`[${reqId}] response`, {
      count: places.length,
      hasAllowsDogs,
      hasRegularOpeningHours: hasRegularOH,
      hasCurrentOpeningHours: hasCurrentOH,
      hasOpenNow,
      sample: places.slice(0, 3).map((p) => ({
        id: p?.id,
        name: safeName(p?.displayName?.text),
        primaryType: p?.primaryType || null,
        allowsDogs: typeof p?.allowsDogs === "boolean" ? p.allowsDogs : null,
        openNow:
          typeof p?.currentOpeningHours?.openNow === "boolean"
            ? p.currentOpeningHours.openNow
            : null,
        hasRegularOH: !!p?.regularOpeningHours,
      })),
    });

    return places;
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    dlog(`[${reqId}] ERROR`, {
      status,
      message: err?.message,
      data: data && typeof data === "object" ? data : String(data || ""),
    });
    throw err;
  }
}

const isV1PhotoName = (s) => /^places\/[^/]+\/photos\/[^/]+$/.test(s);

const isLegacyPhotoRef = (s) => /^[A-Za-z0-9_-]{10,}$/.test(s);

async function resolvePhotoUrl({ name, max = 400 }) {
  const rawName = String(name || "").trim();
  if (!rawName) return null;

  const safeMax = Number.isFinite(Number(max))
    ? Math.min(1600, Math.max(50, Number(max)))
    : 400;

  const cacheKey = `${rawName}|${safeMax}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const isV1 = /^places\/[^/]+\/photos\/[^/]+$/.test(rawName);

  // Legacy "photo_reference" is a blob-ish token; keep a sane allowlist
  const isLegacy = /^[A-Za-z0-9_-]{10,}$/.test(rawName);

  if (!isV1 && !isLegacy) return null;

  let url;
  let headers = {};

  if (isV1) {
    url =
      `https://places.googleapis.com/v1/${rawName}/media` +
      `?maxHeightPx=${safeMax}&maxWidthPx=${safeMax}`;
    headers = { "X-Goog-Api-Key": googleApiKey };
  } else {
    // legacy photo_reference
    url =
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=${safeMax}` +
      `&photo_reference=${encodeURIComponent(rawName)}` +
      `&key=${googleApiKey}`;
    // key is in URL for legacy
  }

  // Don’t follow redirects. Grab Location header.
  const r = await axios.get(url, {
    headers,
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const location = r.headers?.location || null;
  if (location) cacheSet(cacheKey, location);

  return location;
}

router.post("/places-nearby", async (req, res) => {
  const { activityType, quickFilter, lat, lng, radius = 10000, budget } = req.body;
  const pageNum = Math.max(1, Number(req.body.page || 1));
  const perPageNum = Math.min(25, Math.max(5, Number(req.body.perPage || 15)));

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const radiusMeters = Number(radius);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: "Invalid lat/lng" });
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) {
    return res.status(400).json({ error: "Invalid radius (meters). Must be 0 < radius <= 50000" });
  }

  const searchCombos = quickFilter
    ? (quickFilters[quickFilter] || [])
    : (activityTypeKeywords[activityType] || []).map((t) => ({ type: t }));

  const uniqueTypes = Array.from(new Set(searchCombos.map((x) => x?.type).filter(Boolean)));

  const maxTier = budgetToMaxTier(budget);
  const includeUnpriced = true;

  const excludedTypes =
    activityType === "Dining"
      ? EXCLUDED_TYPES.filter((t) => t !== "meal_takeaway")
      : EXCLUDED_TYPES;

  const byId = new Map();

  try {
    const resultsArrays = await Promise.all(
      uniqueTypes.map((type) =>
        fetchNearbyPlaces({
          lat: latNum,
          lng: lngNum,
          radiusMeters,
          type,
          excludedTypes,
        }).catch(() => [])
      )
    );

    for (const arr of resultsArrays) {
      for (const place of arr) {
        if (place?.id && !byId.has(place.id)) byId.set(place.id, place);
      }
    }

    const curatedPlaces = [];
    for (const place of byId.values()) {
      const loc = place?.location;
      if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") continue;

      const distanceMeters = haversineDistance(latNum, lngNum, loc.latitude, loc.longitude);
      if (distanceMeters > radiusMeters) continue;

      const isExcludedByName = /Country Club|Golf Course|Golf Club|Links/i.test(
        place?.displayName?.text || ""
      );
      if (isExcludedByName) continue;

      const tier =
        typeof place?.priceLevel === "string"
          ? PRICE_LEVEL_TO_TIER[place.priceLevel] ?? null
          : (typeof place?.priceLevel === "number" ? place.priceLevel : null);

      const priceOk =
        maxTier == null ||
        (includeUnpriced && tier == null) ||
        (tier != null && tier <= maxTier);

      if (!priceOk) continue;

      const photoName = place?.photos?.[0]?.name || null;

      curatedPlaces.push({
        name: place?.displayName?.text || null,
        types: place?.types || [],
        address: place?.shortFormattedAddress || null,

        // ✅ this is what your DB uses (placeId)
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
      });
    }

    // baseline stable sort (tie-breaker for later)
    curatedPlaces.sort((a, b) => a.distance - b.distance);

    // ==========================
    // ✅ HYDRATE + PRIORITIZE HERE
    // ==========================
    const now = new Date();

    const { hydrated } = await hydratePlacesWithPromosEvents({
      places: curatedPlaces, // expects items with place_id
      now,
    });

    const prioritized = sortPlacesByPromoThenDistance(hydrated);

    // paginate AFTER promo sort
    const start = (pageNum - 1) * perPageNum;
    const paged = prioritized.slice(start, start + perPageNum);

    return res.json({
      curatedPlaces: paged,
      meta: { page: pageNum, perPage: perPageNum, total: prioritized.length },
    });
  } catch (error) {
    dlog("endpoint ERROR", { message: error?.message });
    return res.status(500).json({ error: "Something went wrong with the nearby search." });
  }
});

router.post("/place-photos/resolve", async (req, res) => {
  try {
    const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];
    if (!photos.length) return res.json({ items: [] });

    // hard cap to prevent abuse
    const capped = photos.slice(0, 50);

    const limit = pLimit(6);

    const items = await Promise.all(
      capped.map((p) =>
        limit(async () => {
          const rawName = String(p?.name || "").trim();
          const max = Number(p?.max || 400);

          // reject unknown formats early (prevents random strings hitting Google)
          const ok = isV1PhotoName(rawName) || isLegacyPhotoRef(rawName);
          if (!ok) return { name: rawName, url: null };

          const safeMax = Number.isFinite(max) ? Math.min(1600, Math.max(50, max)) : 400;

          const url = await resolvePhotoUrl({ name: rawName, max: safeMax });
          return { name: rawName, url: url || null };
        })
      )
    );

    return res.json({ items });
  } catch (e) {
    return res.status(500).json({ error: "Failed to resolve photos" });
  }
});

router.post("/events-and-promos-nearby", async (req, res) => {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();

  const log = (...args) => console.log(`[eap-nearby][${reqId}]`, ...args);
  const warn = (...args) => console.warn(`[eap-nearby][${reqId}]`, ...args);
  const errlog = (...args) => console.error(`[eap-nearby][${reqId}]`, ...args);

  const normalizeErr = (e) => ({
    name: e?.name,
    message: e?.message,
    code: e?.code,
    stack: e?.stack,
    // common mongoose extras:
    kind: e?.kind,
    path: e?.path,
    value: e?.value,
    reason: e?.reason?.message || e?.reason,
  });

  const { lat, lng, userId } = req.body;

  // Log raw inputs + types (this catches “lat/lng are strings” instantly)
  log("request", {
    lat,
    lng,
    userId: userId || null,
    latType: typeof lat,
    lngType: typeof lng,
    MAX_DISTANCE_METERS: typeof MAX_DISTANCE_METERS !== "undefined" ? MAX_DISTANCE_METERS : "UNDEFINED",
  });

  // Your current validation is too strict (strings fail), but it returns 400 not 500.
  // Still: log + parse so you can see what's happening.
  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    warn("invalid lat/lng after parse", { lat, lng, latNum, lngNum });
    return res.status(400).json({ error: "Missing or invalid lat/lng" });
  }

  try {
    // ----------------------------
    // User personalization inputs
    // ----------------------------
    const tUser0 = Date.now();

    let userFavorites = new Set();
    let reviewCounts = {};
    let checkInCounts = {};
    let inviteCounts = {};

    if (userId) {
      let user;
      try {
        user = await User.findById(userId).lean();
      } catch (e) {
        // This is a very common 500 cause: invalid ObjectId -> CastError
        errlog("User.findById FAILED", { userId, ...normalizeErr(e) });
        throw e;
      }

      log("user fetched", {
        found: !!user,
        favoritesCount: Array.isArray(user?.favorites) ? user.favorites.length : 0,
        elapsedMs: Date.now() - tUser0,
      });

      if (user?.favorites?.length > 0) {
        userFavorites = new Set(user.favorites.map((fav) => String(fav.placeId)));
      }

      const tPosts0 = Date.now();
      const [reviews, checkIns, invites] = await Promise.all([
        Post.find(
          { type: "review", ownerId: userId, placeId: { $exists: true } },
          { placeId: 1, "details.rating": 1 }
        ).lean(),
        Post.find(
          { type: "check-in", ownerId: userId, placeId: { $exists: true } },
          { placeId: 1 }
        ).lean(),
        Post.find(
          { type: "invite", ownerId: userId, placeId: { $exists: true } },
          { placeId: 1 }
        ).lean(),
      ]);

      log("posts fetched", {
        reviews: reviews?.length || 0,
        checkIns: checkIns?.length || 0,
        invites: invites?.length || 0,
        elapsedMs: Date.now() - tPosts0,
      });

      for (const r of reviews) {
        const pid = String(r.placeId);
        const rating = typeof r?.details?.rating === "number" ? r.details.rating : null;
        if (!reviewCounts[pid]) reviewCounts[pid] = { positive: 0, neutral: 0, negative: 0 };
        if (rating != null) {
          if (rating >= 4) reviewCounts[pid].positive += 1;
          else if (rating === 3) reviewCounts[pid].neutral += 1;
          else if (rating <= 2) reviewCounts[pid].negative += 1;
        }
      }

      for (const { placeId } of checkIns) {
        const pid = String(placeId);
        checkInCounts[pid] = (checkInCounts[pid] || 0) + 1;
      }

      for (const { placeId } of invites) {
        const pid = String(placeId);
        inviteCounts[pid] = (inviteCounts[pid] || 0) + 1;
      }
    } else {
      log("no userId provided; skipping personalization");
    }

    // ----------------------------
    // Nearby businesses by geo query
    // ----------------------------
    const tBiz0 = Date.now();

    // Missing geo index is a VERY common reason this endpoint 500s.
    // Error usually looks like: "unable to find index for $geoNear query"
    let nearbyBusinesses;
    try {
      nearbyBusinesses = await Business.find({
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [lngNum, latNum] },
            $maxDistance: MAX_DISTANCE_METERS,
          },
        },
      }).lean();
    } catch (e) {
      errlog("Business geo query FAILED", {
        coords: { latNum, lngNum },
        MAX_DISTANCE_METERS,
        ...normalizeErr(e),
      });
      throw e;
    }

    log("nearbyBusinesses", {
      count: nearbyBusinesses?.length || 0,
      elapsedMs: Date.now() - tBiz0,
    });

    if (!Array.isArray(nearbyBusinesses) || nearbyBusinesses.length === 0) {
      log("early return: no nearby businesses", { elapsedMs: Date.now() - t0 });
      return res.json({ suggestions: [] });
    }

    const placeIds = nearbyBusinesses
      .map((b) => String(b?.placeId || ""))
      .filter(Boolean);

    log("placeIds extracted", { count: placeIds.length });

    if (!placeIds.length) {
      log("early return: no placeIds on nearby businesses", { elapsedMs: Date.now() - t0 });
      return res.json({ suggestions: [] });
    }

    // ----------------------------
    // Batch fetch promos/events once
    // ----------------------------
    const tPE0 = Date.now();

    const now = new Date();
    const weekday = now.toLocaleString("en-US", { weekday: "long" });
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayWeekday = yesterday.toLocaleString("en-US", { weekday: "long" });

    const startOfYesterday = new Date(yesterday);
    startOfYesterday.setHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(now);
    startOfTomorrow.setDate(now.getDate() + 1);
    startOfTomorrow.setHours(0, 0, 0, 0);

    log("time window", {
      now: now.toISOString(),
      weekday,
      yesterdayWeekday,
      startOfYesterday: startOfYesterday.toISOString(),
      startOfTomorrow: startOfTomorrow.toISOString(),
    });

    const [allPromos, allEvents] = await Promise.all([
      Promotion.find({
        placeId: { $in: placeIds },
        $or: [
          { recurring: true, recurringDays: { $in: [weekday, yesterdayWeekday] } },
          { recurring: { $ne: true }, date: { $gte: startOfYesterday, $lt: startOfTomorrow } },
        ],
      }).lean(),
      Event.find({
        placeId: { $in: placeIds },
        $or: [
          { recurring: true, recurringDays: { $in: [weekday, yesterdayWeekday] } },
          { recurring: { $ne: true }, date: { $gte: startOfYesterday, $lt: startOfTomorrow } },
        ],
      }).lean(),
    ]);

    log("promos/events fetched", {
      promos: allPromos?.length || 0,
      events: allEvents?.length || 0,
      elapsedMs: Date.now() - tPE0,
    });

    // Group by placeId
    const promosByPlaceId = new Map();
    for (const p of Array.isArray(allPromos) ? allPromos : []) {
      const pid = String(p?.placeId || "");
      if (!pid) continue;
      if (!promosByPlaceId.has(pid)) promosByPlaceId.set(pid, []);
      promosByPlaceId.get(pid).push(p);
    }

    const eventsByPlaceId = new Map();
    for (const e of Array.isArray(allEvents) ? allEvents : []) {
      const pid = String(e?.placeId || "");
      if (!pid) continue;
      if (!eventsByPlaceId.has(pid)) eventsByPlaceId.set(pid, []);
      eventsByPlaceId.get(pid).push(e);
    }

    log("grouped counts", {
      promoBuckets: promosByPlaceId.size,
      eventBuckets: eventsByPlaceId.size,
    });

    // Per-request caches (do NOT use global Maps here)
    const logoCache = new Map();
    const bannerCache = new Map();

    // ----------------------------
    // Enrich + flatten
    // ----------------------------
    const tFlat0 = Date.now();
    const flattenedSuggestions = [];
    let perBizErrors = 0;
    let skippedNoDocs = 0;

    for (const biz of nearbyBusinesses) {
      const pid = String(biz?.placeId || "");
      if (!pid) continue;

      const promosForBiz = promosByPlaceId.get(pid) || [];
      const eventsForBiz = eventsByPlaceId.get(pid) || [];

      if (promosForBiz.length === 0 && eventsForBiz.length === 0) {
        skippedNoDocs += 1;
        continue;
      }

      try {
        const enrichedBiz = await enrichBusinessWithPromosAndEvents(
          biz,
          latNum,
          lngNum,
          promosForBiz,
          eventsForBiz,
          now,
          { logoCache, bannerCache }
        );

        if (!enrichedBiz) continue;

        const {
          businessName,
          placeId,
          location,
          logoUrl,
          bannerUrl,
          distance,
          activePromos = [],
          upcomingPromos = [],
          activeEvents = [],
          upcomingEvents = [],
        } = enrichedBiz;

        const shared = {
          type: "suggestion",
          businessName,
          placeId,
          location,
          logoUrl,
          bannerUrl,
          distance,
        };

        const pushMany = (entries, kind) => {
          if (!Array.isArray(entries) || !entries.length) return;
          for (const entry of entries) {
            flattenedSuggestions.push({ ...shared, ...entry, kind });
          }
        };

        pushMany(activePromos, "activePromo");
        pushMany(upcomingPromos, "upcomingPromo");
        pushMany(activeEvents, "activeEvent");
        pushMany(upcomingEvents, "upcomingEvent");
      } catch (e) {
        perBizErrors += 1;
        errlog("per-biz enrich FAILED (swallowed)", { pid, ...normalizeErr(e) });
      }
    }

    log("flatten summary", {
      flattened: flattenedSuggestions.length,
      skippedNoDocs,
      perBizErrors,
      elapsedMs: Date.now() - tFlat0,
    });

    if (flattenedSuggestions.length === 0) {
      log("early return: nothing flattened", { elapsedMs: Date.now() - t0 });
      return res.json({ suggestions: [] });
    }

    // ----------------------------
    // Score + rank suggestions
    // ----------------------------
    const tScore0 = Date.now();
    const scoredSuggestions = [];
    let skippedForNegatives = 0;

    for (const suggestion of flattenedSuggestions) {
      const pid = String(suggestion.placeId);
      const isFavorited = userFavorites.has(pid);
      const posReviews = reviewCounts[pid]?.positive || 0;
      const neutralReviews = reviewCounts[pid]?.neutral || 0;
      const negReviews = reviewCounts[pid]?.negative || 0;
      const checkIns = checkInCounts[pid] || 0;
      const invites = inviteCounts[pid] || 0;

      if (negReviews > 0 && posReviews === 0 && neutralReviews === 0 && !isFavorited) {
        skippedForNegatives += 1;
        continue;
      }

      const weightedScore =
        posReviews * 2 +
        neutralReviews * 1 +
        checkIns * 1 +
        invites * 0.5;

      const finalScore = isFavorited ? 1000 + weightedScore : weightedScore;

      scoredSuggestions.push({ ...suggestion, _score: finalScore });
    }

    scoredSuggestions.sort((a, b) => b._score - a._score);

    const cleanSuggestions = scoredSuggestions.map(({ _score, ...rest }) => rest);

    log("score summary", {
      input: flattenedSuggestions.length,
      output: cleanSuggestions.length,
      skippedForNegatives,
      elapsedMs: Date.now() - tScore0,
    });

    log("response", {
      returned: cleanSuggestions.length,
      elapsedMs: Date.now() - t0,
    });

    return res.json({ suggestions: cleanSuggestions });
  } catch (err) {
    // This is the one you care about: actual 500 root cause
    errlog("FATAL 500", {
      elapsedMs: Date.now() - t0,
      ...normalizeErr(err),
    });

    return res.status(500).json({ error: "Failed to fetch active promos/events nearby." });
  }
});

module.exports = router;
