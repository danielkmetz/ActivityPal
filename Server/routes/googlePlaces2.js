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
const { getCuratedPlacesNearbyV1 } = require("../services/places/v1/curatePlacesNearby");

const googleApiKey = process.env.GOOGLE_PLACES2;

const MAX_DISTANCE_METERS = 8046.72; // 5 miles

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

const isV1PhotoName = (s) => /^places\/[^/]+\/photos\/[^/]+$/.test(s);
const isLegacyPhotoRef = (s) => /^[A-Za-z0-9_-]{10,}$/.test(s);

// ---- Canonical query extraction ----
// Frontend sometimes sends { query: {...} } and sometimes sends fields top-level.
// Normalize to one query object.
function getIncomingQuery(body) {
  const q =
    body && typeof body.query === "object" && body.query
      ? body.query
      : body || {};
  return q;
}

function normalizeRadiusMeters(q) {
  const r = q.radiusMeters ?? q.radius;
  const n = Number(r);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

  // Don’t follow redirects. Grab Location header.
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
  try {
    const apiKey = process.env.GOOGLE_PLACES2;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "Server misconfigured (Google Places key missing)." });
    }

    // normalize incoming request into a canonical query object
    const qRaw = getIncomingQuery(req.body);

    const lat = Number(qRaw.lat);
    const lng = Number(qRaw.lng);

    const radiusMeters = normalizeRadiusMeters(qRaw) ?? 10000;
    const page = Number(qRaw.page ?? req.body.page ?? 1);
    const perPage = Number(qRaw.perPage ?? req.body.perPage ?? 15);

    const activityType = qRaw.activityType ?? null;
    const quickFilter = qRaw.quickFilter ?? null;
    const placeCategory = qRaw.placeCategory ?? null;
    const keyword = qRaw.keyword ?? null;

    const vibes = qRaw.vibes ?? null;
    const familyFriendly = qRaw.familyFriendly ?? null;
    const placesFilters = qRaw.placesFilters ?? null;
    const budget = qRaw.budget ?? null;

    const whenAtISO = qRaw.whenAtISO ?? null;

    // Validate whenAtISO if present
    if (whenAtISO && Number.isNaN(new Date(whenAtISO).getTime())) {
      return res.status(400).json({ error: "Invalid whenAtISO" });
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Missing or invalid lat/lng" });
    }

    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) {
      return res.status(400).json({
        error: "Invalid radius (meters). Must be 0 < radius <= 50000",
      });
    }

    const canonicalQuery = {
      ...qRaw,
      whenAtISO,
      lat,
      lng,
      radius: radiusMeters, // canonical
      radiusMeters,
      page,
      perPage,
      activityType,
      quickFilter,
      placeCategory,
      keyword,
      vibes,
      familyFriendly,
      placesFilters,
      budget,
    };

    const out = await getCuratedPlacesNearbyV1({
      apiKey,
      query: canonicalQuery,

      // legacy
      activityType,
      quickFilter,
      placeCategory,
      keyword,
      vibes,
      familyFriendly,
      placesFilters,

      lat,
      lng,
      radiusMeters,
      budget,
      page,
      perPage,
      log: null,
    });

    if (out?.error) {
      return res
        .status(out.error.status || 500)
        .json({ error: out.error.message || "Error" });
    }

    return res.json(out);
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Something went wrong with the nearby search." });
  }
});

router.post("/place-photos/resolve", async (req, res) => {
  const reqId = Math.random().toString(16).slice(2, 10);
  const startedAt = Date.now();

  // flip to false in production if you want
  const DEBUG = false;

  try {
    const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];

    if (DEBUG) {
      console.log(`[place-photos][${reqId}] start`, {
        receivedCount: photos.length,
        bodyKeys: req.body ? Object.keys(req.body) : [],
      });
    }

    if (!photos.length) {
      if (DEBUG)
        console.log(`[place-photos][${reqId}] empty -> 200`, {
          ms: Date.now() - startedAt,
        });
      return res.json({ items: [] });
    }

    // hard cap to prevent abuse
    const capped = photos.slice(0, 50);

    // basic stats: unique names + validity
    const names = capped
      .map((p) => String(p?.name || "").trim())
      .filter(Boolean);
    const uniqueNames = new Set(names);

    if (DEBUG) {
      console.log(`[place-photos][${reqId}] capped`, {
        cappedCount: capped.length,
        uniqueCount: uniqueNames.size,
        sampleNames: Array.from(uniqueNames).slice(0, 5),
      });
    }

    const limit = pLimit(6);

    let valid = 0;
    let rejected = 0;
    let resolved = 0;
    let nullUrl = 0;

    // OPTIONAL: sample per-photo timing (only log first N)
    const TIMING_SAMPLE_N = 8;

    const items = await Promise.all(
      capped.map((p, idx) =>
        limit(async () => {
          const t0 = Date.now();

          const rawName = String(p?.name || "").trim();
          const maxIn = Number(p?.max || 400);

          const ok = isV1PhotoName(rawName) || isLegacyPhotoRef(rawName);
          if (!ok) {
            rejected += 1;

            if (DEBUG && idx < TIMING_SAMPLE_N) {
              console.log(`[place-photos][${reqId}] reject`, {
                idx,
                name: rawName,
                maxIn,
                ms: Date.now() - t0,
              });
            }

            return { name: rawName, url: null };
          }

          valid += 1;

          const safeMax = Number.isFinite(maxIn)
            ? Math.min(1600, Math.max(50, maxIn))
            : 400;

          const url = await resolvePhotoUrl({ name: rawName, max: safeMax });

          if (url) resolved += 1;
          else nullUrl += 1;

          if (DEBUG && idx < TIMING_SAMPLE_N) {
            console.log(`[place-photos][${reqId}] resolved`, {
              idx,
              name: rawName,
              safeMax,
              url: url ? "ok" : "null",
              ms: Date.now() - t0,
            });
          }

          return { name: rawName, url: url || null };
        })
      )
    );

    if (DEBUG) {
      console.log(`[place-photos][${reqId}] done`, {
        receivedCount: photos.length,
        cappedCount: capped.length,
        uniqueCount: uniqueNames.size,
        valid,
        rejected,
        resolved,
        nullUrl,
        ms: Date.now() - startedAt,
      });
    }

    return res.json({ items });
  } catch (e) {
    console.log(`[place-photos][${reqId}] ERROR`, {
      msg: e?.message || String(e),
      ms: Date.now() - startedAt,
    });
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
        userFavorites = new Set(
          user.favorites.map((fav) => String(fav.placeId))
        );
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
        const rating =
          typeof r?.details?.rating === "number" ? r.details.rating : null;
        if (!reviewCounts[pid])
          reviewCounts[pid] = { positive: 0, neutral: 0, negative: 0 };
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
    const yesterdayWeekday = yesterday.toLocaleString("en-US", {
      weekday: "long",
    });

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
