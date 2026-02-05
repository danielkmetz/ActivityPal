const express = require("express");
const axios = require("axios");
const router = express.Router();
const Business = require("../models/Business");
const { Post } = require("../models/Post");
const User = require("../models/User");
const { enrichBusinessWithPromosAndEvents } = require("../utils/enrichBusinesses");
const pLimitPkg = require("p-limit");
const pLimit = pLimitPkg.default || pLimitPkg;
const Event = require("../models/Events");
const Promotion = require("../models/Promotions");
const { getCuratedPlacesNearbyV1 } = require("../services/places/handlers/curatePlacesNearby");
const { normalizePlacesRequest } = require("../services/places/query/query");

const googleApiKey = process.env.GOOGLE_KEY;
const MAX_DISTANCE_METERS = 8046.72; // 5 miles
const PHOTO_URL_TTL_MS = 1000 * 60 * 30; // 30 min
const photoCache = new Map(); // key -> { url, exp }

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

const isV1PhotoName = (s) => /^places\/[^/]+\/photos\/[^/]+$/.test(s);
const isLegacyPhotoRef = (s) => /^[A-Za-z0-9_-]{10,}$/.test(s);

async function resolvePhotoUrl({ name, max = 400 }, ctx = {}) {
  const rawName = String(name || "").trim();
  if (!rawName) return null;

  const safeMax = Number.isFinite(Number(max))
    ? Math.min(1600, Math.max(50, Number(max)))
    : 400;

  const cacheKey = `${rawName}|${safeMax}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const isV1 = isV1PhotoName(rawName);
  const isLegacy = isLegacyPhotoRef(rawName);

  if (!isV1 && !isLegacy) return null;

  let url;
  let headers = {};

  if (isV1) {
    url =
      `https://places.googleapis.com/v1/${rawName}/media` +
      `?maxHeightPx=${safeMax}&maxWidthPx=${safeMax}`;
    headers = { "X-Goog-Api-Key": googleApiKey };
  } else {
    url =
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=${safeMax}` +
      `&photo_reference=${encodeURIComponent(rawName)}` +
      `&key=${googleApiKey}`;
  }

  const r = await axios.get(url, {
    headers,
    maxRedirects: 0,
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const location = r.headers?.location || null;
  if (location) cacheSet(cacheKey, location);

  return location;
}

router.post("/places-nearby", async (req, res) => {
  const reqId = Math.random().toString(16).slice(2, 10);

  try {
    const apiKey = process.env.GOOGLE_PLACES2;
    if (!(typeof apiKey === "string" && apiKey.length > 10)) {
      return res
        .status(500)
        .json({ error: "Server misconfigured (Google Places key missing)." });
    }

    // ---- STRICT wrapper-only normalization ----
    const norm = normalizePlacesRequest(req.body, {
      strictWrapper: true,
      perPageOpts: { min: 5, max: 25, fallback: 15 },
    });

    if (!norm.ok) {
      return res.status(norm.status || 400).json({ error: norm.error });
    }

    const qIn = norm.qIn || {};
    
    // STRICT: reject legacy offset paging
    if (typeof qIn.page !== "undefined" || typeof req.body?.page !== "undefined") {
      return res.status(400).json({
        error: "Offset paging is not supported. Use cursor-based pagination (meta.cursor).",
      });
    }

    // keep your ISO validation (only matters for new searches)
    if (norm.kind === "new" && qIn.whenAtISO && Number.isNaN(new Date(qIn.whenAtISO).getTime())) {
      return res.status(400).json({ error: "Invalid whenAtISO" });
    }

    const canonicalQuery =
      norm.kind === "cursor"
        ? {
          cursor: norm.value.cursor,
          perPage: norm.value.perPage,
          queryHash: norm.value.queryHash,
          debug: norm.value.debug === true,
          reqId,
        }
        : {
          ...norm.value, // validated + canonicalized: lat/lng/radiusMeters/etc (+ perPage/debug/queryHash)
          cursor: null,
          reqId,
          ...(typeof qIn.prefetchAll === "boolean" ? { prefetchAll: qIn.prefetchAll } : {}),
          ...(qIn.whenAtISO ? { whenAtISO: qIn.whenAtISO } : {}),
        };

    const out = await getCuratedPlacesNearbyV1({
      apiKey,
      query: canonicalQuery,
      now: new Date(),
      log: null,
    });

    if (out?.error) {
      return res.status(out.error.status || 500).json({
        error: out.error.message || "Error",
      });
    }

    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong with the nearby search." });
  }
});

router.post("/place-photos/resolve", async (req, res) => {
  try {
    const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];

    if (!photos.length) {
      return res.json({ items: [] });
    }

    const capped = photos.slice(0, 50);

    const limit = pLimit(6);

    const items = await Promise.all(
      capped.map((p) =>
        limit(async () => {
          const rawName = String(p?.name || "").trim();
          const maxIn = Number(p?.max || 400);

          const ok = isV1PhotoName(rawName) || isLegacyPhotoRef(rawName);
          if (!ok) {
            return { name: rawName, url: null };
          }

          const safeMax = Number.isFinite(maxIn)
            ? Math.min(1600, Math.max(50, maxIn))
            : 400;

          const url = await resolvePhotoUrl({ name: rawName, max: safeMax });

          return { name: rawName, url: url || null };
        })
      )
    );

    return res.json({ items });
  } catch {
    return res.status(500).json({ error: "Failed to resolve photos" });
  }
});

router.post("/events-and-promos-nearby", async (req, res) => {
  const { lat, lng, userId } = req.body;

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: "Missing or invalid lat/lng" });
  }

  const maxDistanceMeters =
    typeof MAX_DISTANCE_METERS !== "undefined" ? MAX_DISTANCE_METERS : 0;

  try {
    let userFavorites = new Set();
    let reviewCounts = {};
    let checkInCounts = {};
    let inviteCounts = {};

    if (userId) {
      const user = await User.findById(userId).lean();

      if (user?.favorites?.length > 0) {
        userFavorites = new Set(user.favorites.map((fav) => String(fav.placeId)));
      }

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

      for (const r of reviews || []) {
        const pid = String(r.placeId);
        const rating = typeof r?.details?.rating === "number" ? r.details.rating : null;
        if (!reviewCounts[pid]) reviewCounts[pid] = { positive: 0, neutral: 0, negative: 0 };
        if (rating != null) {
          if (rating >= 4) reviewCounts[pid].positive += 1;
          else if (rating === 3) reviewCounts[pid].neutral += 1;
          else if (rating <= 2) reviewCounts[pid].negative += 1;
        }
      }

      for (const { placeId } of checkIns || []) {
        const pid = String(placeId);
        checkInCounts[pid] = (checkInCounts[pid] || 0) + 1;
      }

      for (const { placeId } of invites || []) {
        const pid = String(placeId);
        inviteCounts[pid] = (inviteCounts[pid] || 0) + 1;
      }
    }

    const nearbyBusinesses = await Business.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lngNum, latNum] },
          $maxDistance: maxDistanceMeters,
        },
      },
    }).lean();

    if (!Array.isArray(nearbyBusinesses) || nearbyBusinesses.length === 0) {
      return res.json({ suggestions: [] });
    }

    const placeIds = nearbyBusinesses
      .map((b) => String(b?.placeId || ""))
      .filter(Boolean);

    if (!placeIds.length) {
      return res.json({ suggestions: [] });
    }

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

    const logoCache = new Map();
    const bannerCache = new Map();

    const flattenedSuggestions = [];

    for (const biz of nearbyBusinesses) {
      const pid = String(biz?.placeId || "");
      if (!pid) continue;

      const promosForBiz = promosByPlaceId.get(pid) || [];
      const eventsForBiz = eventsByPlaceId.get(pid) || [];

      if (promosForBiz.length === 0 && eventsForBiz.length === 0) continue;

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
      } catch {
        // swallow per-biz errors
      }
    }

    if (flattenedSuggestions.length === 0) {
      return res.json({ suggestions: [] });
    }

    const scoredSuggestions = [];

    for (const suggestion of flattenedSuggestions) {
      const pid = String(suggestion.placeId);
      const isFavorited = userFavorites.has(pid);
      const posReviews = reviewCounts[pid]?.positive || 0;
      const neutralReviews = reviewCounts[pid]?.neutral || 0;
      const negReviews = reviewCounts[pid]?.negative || 0;
      const checkIns = checkInCounts[pid] || 0;
      const invites = inviteCounts[pid] || 0;

      if (negReviews > 0 && posReviews === 0 && neutralReviews === 0 && !isFavorited) {
        continue;
      }

      const weightedScore = posReviews * 2 + neutralReviews * 1 + checkIns * 1 + invites * 0.5;
      const finalScore = isFavorited ? 1000 + weightedScore : weightedScore;

      scoredSuggestions.push({ ...suggestion, _score: finalScore });
    }

    scoredSuggestions.sort((a, b) => b._score - a._score);

    const cleanSuggestions = scoredSuggestions.map(({ _score, ...rest }) => rest);

    return res.json({ suggestions: cleanSuggestions });
  } catch {
    return res.status(500).json({ error: "Failed to fetch active promos/events nearby." });
  }
});

module.exports = router;
