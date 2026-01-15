const express = require("express");
const axios = require("axios");
const router = express.Router();
const { isFastFood } = require('../utils/isFastFood');
const { classifyRestaurantCuisine } = require('../RestaurantClass/Keywords/Keywords');
const { getCuisineFromLanguage } = require('../RestaurantClass/Language');
const { classifyCuisineFromReviews } = require('../RestaurantClass/ByReview');
const { haversineDistance } = require('../utils/haversineDistance');
const { hydratePlacesWithPromosEvents, sortPlacesByPromoThenDistance } = require("../utils/PromosEvents/hydratePromosEvents");

const googleApiKey = process.env.GOOGLE_KEY;

const quickFilters = {
  dateNight: ['top golf', 'escape room', 'restaurant', 'bar', 'bowling_alley', 'movie_theater'],
  Dining: ['restaurant', 'bar', 'cafe'],
  outdoor: ['park', 'hiking', 'beach', 'lake', 'campground', 'botanical garden'],
  movieNight: ['movie theater', 'drive-in theater', 'IMAX'],
  gaming: ['arcade', 'bowling', 'escape room', 'laser tag'],
  artAndCulture: ['museum', 'art gallery'],
  familyFun: ['amusement park', 'zoo', 'aquarium', 'trampoline park', 'family entertainment', 'museum'],
  petFriendly: ['pet friendly', 'pet friendly restaurant'],
  liveMusic: ['live music venue', 'concert hall', 'jazz club', 'music festival', 'karaoke bar', 'rooftop bar with live music', 'patio', 'outdoor seating'],
  whatsClose: ['establishment', 'entertainment'],
};

const activityTypeKeywords = {
  Dining: [
    { type: 'restaurant' },
    { type: 'bar' },
    { type: 'cafe' },
  ],

  Entertainment: [
    { type: 'movie_theater' },
    { type: 'bowling_alley' },
    { type: 'amusement_center' },
    { type: 'art_gallery' },
    { type: 'establishment', keyword: 'bowling arcade karaoke escape room comedy club live music' },
  ],

  Outdoor: [
    { type: 'park' },
    { type: 'tourist_attraction' },
    { type: 'campground' },
    { type: 'zoo' },
    { type: 'aquarium' },
    { type: 'rv_park' },
    { type: 'natural_feature' },
  ],

  Indoor: [
    { type: 'bowling_alley' },
    { type: 'museum' },
    { type: 'aquarium' },
    { type: 'art_gallery' },
    { type: 'gym' },
    { type: 'movie_theater' },
    { type: 'casino' },
    { type: 'amusement_center' },
    { type: 'establishment', keyword: 'escape room trampoline indoor mini golf' },
  ],

  Family: [
    { type: 'zoo' },
    { type: 'aquarium' },
    { type: 'museum' },
    { type: 'park' },
    { type: 'amusement_park' },
    { type: 'playground' },
    { type: 'establishment', keyword: 'petting zoo trampoline family entertainment children museum' },
  ],
};

router.post("/places", async (req, res) => {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();

  const log = (...args) => console.log(`[places][${reqId}]`, ...args);
  const warn = (...args) => console.warn(`[places][${reqId}]`, ...args);
  const errlog = (...args) => console.error(`[places][${reqId}]`, ...args);

  // 🔥 TARGET PLACE to trace end-to-end
  const TRACE_PLACE_ID = "ChIJC-gx3K4CD4gRdihO2jMKjRM";
  const trace = {
    placeId: TRACE_PLACE_ID,
    stage: {
      seenInGoogle: false,
      seenInGoogleCombos: [],
      filteredOut: false,
      filteredReason: null,
      builtOut: false,
      builtReason: null,
      madeCurated: false,
      inPageSlice: false,
      pageIndex: null,
      distanceMiles: null,
      openNow: null,
      price_level: null,
      types: null,
      name: null,
    },
  };

  const { lat, lng, activityType, radius, budget, isCustom } = req.body;

  const pageNum = Math.max(1, Number(req.body.page || 1));
  const perPageNum = Math.min(25, Math.max(5, Number(req.body.perPage || 15)));

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const radiusMeters = Number(radius);

  log("request", {
    activityType,
    isCustom: !!isCustom,
    budget,
    page: pageNum,
    perPage: perPageNum,
    radiusMeters,
    lat: Number.isFinite(latNum) ? +latNum.toFixed(5) : lat,
    lng: Number.isFinite(lngNum) ? +lngNum.toFixed(5) : lng,
    tracePlaceId: TRACE_PLACE_ID,
  });

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    warn("invalid coords", { lat, lng });
    return res.status(400).json({ error: "Invalid lat/lng" });
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) {
    warn("invalid radius", { radius });
    return res
      .status(400)
      .json({ error: "Invalid radius (meters). Must be 0 < radius <= 50000" });
  }

  const searchCombos = isCustom
    ? activityTypeKeywords[activityType] || []
    : (quickFilters[activityType] || []).map((k) => ({
        type: "establishment",
        keyword: k,
      }));

  log("searchCombos", {
    count: Array.isArray(searchCombos) ? searchCombos.length : 0,
    sample: (searchCombos || []).slice(0, 10),
  });

  if (!Array.isArray(searchCombos) || searchCombos.length === 0) {
    warn("NO searchCombos (activityType/quickFilters mismatch)", { activityType, isCustom });
    log("TRACE final", trace);
    return res.json({ curatedPlaces: [], meta: { page: pageNum, perPage: perPageNum, total: 0 } });
  }

  const allResults = new Map();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchStats = {
    calls: 0,
    pages: 0,
    ok: 0,
    zeroResults: 0,
    otherStatus: 0,
    added: 0,
    dupes: 0,
    errors: 0,
  };

  const fetchPlaces = async (type, keyword) => {
    fetchStats.calls += 1;

    const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : "";
    const urlBase =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${latNum},${lngNum}` +
      `&radius=${radiusMeters}` +
      `&type=${encodeURIComponent(type)}` +
      `&key=${googleApiKey}` +
      keywordParam;

    let pageToken = null;
    let pages = 0;

    do {
      const fullUrl = `${urlBase}${pageToken ? `&pagetoken=${pageToken}` : ""}`;
      const tPage = Date.now();

      try {
        const response = await axios.get(fullUrl);
        const data = response?.data || {};
        const status = data?.status;
        const errorMessage = data?.error_message;

        fetchStats.pages += 1;
        pages += 1;

        if (status === "OK") fetchStats.ok += 1;
        else if (status === "ZERO_RESULTS") fetchStats.zeroResults += 1;
        else fetchStats.otherStatus += 1;

        if (status !== "OK") {
          warn("google status not OK", {
            type,
            keyword: keyword || null,
            status,
            errorMessage: errorMessage || null,
            elapsedMs: Date.now() - tPage,
          });
          break;
        }

        const results = Array.isArray(data?.results) ? data.results : [];
        const next = data?.next_page_token || null;

        // 🔎 TRACE: did this page contain the target placeId?
        const traceHit = results.find((p) => p?.place_id === TRACE_PLACE_ID);
        if (traceHit) {
          trace.stage.seenInGoogle = true;
          trace.stage.seenInGoogleCombos.push({ type, keyword: keyword || null, page: pages });
          trace.stage.name = traceHit?.name || null;
          trace.stage.types = traceHit?.types || null;
          trace.stage.price_level = traceHit?.price_level ?? null;
          trace.stage.openNow =
            typeof traceHit?.opening_hours?.open_now === "boolean"
              ? traceHit.opening_hours.open_now
              : null;

          log("TRACE google hit", {
            combo: { type, keyword: keyword || null, page: pages },
            name: trace.stage.name,
            types: trace.stage.types,
            price_level: trace.stage.price_level,
            open_now: trace.stage.openNow,
            hasGeom: !!traceHit?.geometry?.location,
          });
        }

        let addedThisPage = 0;
        let dupedThisPage = 0;

        for (const place of results) {
          const id = place?.place_id;
          if (!id) continue;
          if (allResults.has(id)) {
            dupedThisPage += 1;
            continue;
          }
          allResults.set(id, place);
          addedThisPage += 1;
        }

        fetchStats.added += addedThisPage;
        fetchStats.dupes += dupedThisPage;

        pageToken = next;
        if (pageToken) await delay(2000);
      } catch (error) {
        fetchStats.errors += 1;
        errlog("fetch error", {
          type,
          keyword: keyword || null,
          message: error?.message,
          status: error?.response?.status,
          googleDataStatus: error?.response?.data?.status,
          googleErrorMessage: error?.response?.data?.error_message,
        });
        break;
      }
    } while (pageToken && pages < 3);
  };

  try {
    await Promise.all(searchCombos.map(({ type, keyword }) => fetchPlaces(type, keyword)));

    log("fetch summary", {
      unique: allResults.size,
      fetchStats,
      elapsedMs: Date.now() - t0,
      traceSeenInGoogle: trace.stage.seenInGoogle,
      traceCombos: trace.stage.seenInGoogleCombos,
    });

    if (allResults.size === 0) {
      warn("ZERO unique results from Google before filtering");
      log("TRACE final", trace);
      return res.json({ curatedPlaces: [], meta: { page: pageNum, perPage: perPageNum, total: 0 } });
    }

    const gasStationNamePattern =
      /speedy|speedway|bp|shell|mobil|exxon|citgo|chevron|circle\s?k|thorntons|amoco|7-eleven|7 eleven|casey's|caseys|kum\s?&\s?go|love's|loves|pilot|sunoco|marathon|quiktrip|qt|valero|conoco/i;

    const filterCounts = {
      start: allResults.size,
      excludedByType: 0,
      excludedByGasName: 0,
      excludedByCountryClub: 0,
      excludedFastFood: 0,
      excludedBudget: 0,
      kept: 0,
    };

    const filtered = Array.from(allResults.values()).filter((place) => {
      const id = place?.place_id;
      const name = place?.name || "";

      const hasExcludedType = place.types?.some((t) =>
        ["school", "doctor", "hospital", "lodging", "airport", "store", "storage", "golf_course", "casino", "gas_station"].includes(t)
      );
      if (hasExcludedType) {
        filterCounts.excludedByType += 1;
        if (id === TRACE_PLACE_ID) {
          trace.stage.filteredOut = true;
          trace.stage.filteredReason = { reason: "excludedByType", types: place?.types || [] };
          log("TRACE filtered OUT", trace.stage.filteredReason);
        }
        return false;
      }
      if (gasStationNamePattern.test(name)) {
        filterCounts.excludedByGasName += 1;
        if (id === TRACE_PLACE_ID) {
          trace.stage.filteredOut = true;
          trace.stage.filteredReason = { reason: "excludedByGasName", name };
          log("TRACE filtered OUT", trace.stage.filteredReason);
        }
        return false;
      }
      if (/Country Club|Golf Course|Golf Club|Links/i.test(name)) {
        filterCounts.excludedByCountryClub += 1;
        if (id === TRACE_PLACE_ID) {
          trace.stage.filteredOut = true;
          trace.stage.filteredReason = { reason: "excludedByCountryClub", name };
          log("TRACE filtered OUT", trace.stage.filteredReason);
        }
        return false;
      }
      if (isFastFood(name)) {
        filterCounts.excludedFastFood += 1;
        if (id === TRACE_PLACE_ID) {
          trace.stage.filteredOut = true;
          trace.stage.filteredReason = { reason: "excludedFastFood", name };
          log("TRACE filtered OUT", trace.stage.filteredReason);
        }
        return false;
      }

      const budgetFiltered =
        (budget === "$" && !(place.price_level === 0 || place.price_level === 1)) ||
        (budget === "$$" && !(place.price_level <= 2)) ||
        (budget === "$$$" && !(place.price_level <= 3)) ||
        (budget === "$$$$" && place.price_level > 4);

      if (budgetFiltered) {
        filterCounts.excludedBudget += 1;
        if (id === TRACE_PLACE_ID) {
          trace.stage.filteredOut = true;
          trace.stage.filteredReason = { reason: "excludedBudget", price_level: place?.price_level ?? null, budget };
          log("TRACE filtered OUT", trace.stage.filteredReason);
        }
        return false;
      }

      filterCounts.kept += 1;

      if (id === TRACE_PLACE_ID) {
        log("TRACE passed filter", {
          name,
          types: place?.types || [],
          price_level: place?.price_level ?? null,
        });
      }

      return true;
    });

    log("filter summary", filterCounts);

    // If TRACE place was seen in Google but not in filtered, explain explicitly
    if (trace.stage.seenInGoogle && !filtered.some((p) => p?.place_id === TRACE_PLACE_ID)) {
      log("TRACE result", {
        seenInGoogle: true,
        madeFiltered: false,
        filteredReason: trace.stage.filteredReason,
      });
    }

    const buildCounts = {
      filteredCount: filtered.length,
      missingGeom: 0,
      outsideRadius: 0,
      built: 0,
      openNowKnown: 0,
      photoKnown: 0,
    };

    const curatedPlaces = [];
    for (const place of filtered) {
      const id = place?.place_id;
      const pLat = Number(place?.geometry?.location?.lat);
      const pLng = Number(place?.geometry?.location?.lng);

      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) {
        buildCounts.missingGeom += 1;
        if (id === TRACE_PLACE_ID) {
          trace.stage.builtOut = true;
          trace.stage.builtReason = { reason: "missingGeom", hasGeom: !!place?.geometry?.location };
          log("TRACE build OUT", trace.stage.builtReason);
        }
        continue;
      }

      const distanceMeters = haversineDistance(latNum, lngNum, pLat, pLng);

      if (distanceMeters > radiusMeters) {
        buildCounts.outsideRadius += 1;
        if (id === TRACE_PLACE_ID) {
          trace.stage.builtOut = true;
          trace.stage.builtReason = { reason: "outsideRadius", distanceMeters, radiusMeters };
          log("TRACE build OUT", trace.stage.builtReason);
        }
        continue;
      }

      const distanceMiles = distanceMeters / 1609.34;

      const openNow =
        typeof place?.opening_hours?.open_now === "boolean"
          ? place.opening_hours.open_now
          : null;

      const photoName = place?.photos?.[0]?.photo_reference || null;

      if (openNow !== null) buildCounts.openNowKnown += 1;
      if (photoName) buildCounts.photoKnown += 1;

      const built = {
        name: place?.name || null,
        types: place?.types || [],
        address: place?.vicinity || null,
        place_id: id || null,
        openNow,
        photoUrl: null,
        photoName,
        distance: +distanceMiles.toFixed(2),
        location: { lat: pLat, lng: pLng },
        cuisine: "unknown",
      };

      curatedPlaces.push(built);
      buildCounts.built += 1;

      if (id === TRACE_PLACE_ID) {
        trace.stage.madeCurated = true;
        trace.stage.distanceMiles = built.distance;
        trace.stage.openNow = built.openNow;
        trace.stage.types = built.types;
        trace.stage.name = built.name;
        log("TRACE built curated", {
          name: built.name,
          distanceMiles: built.distance,
          openNow: built.openNow,
          types: (built.types || []).slice(0, 10),
        });
      }
    }

    log("build summary", buildCounts);

    // keep distance sort as a stable baseline (tie-breaker later)
    curatedPlaces.sort((a, b) => a.distance - b.distance);

    // ============================
    // ✅ HYDRATE + PRIORITIZE (via helper)
    // ============================
    const now = new Date();

    const { hydrated } = await hydratePlacesWithPromosEvents({
      places: curatedPlaces,
      now,
    });

    const curatedWithPromosEvents = sortPlacesByPromoThenDistance(hydrated);

    log("promo sort summary", {
      total: curatedWithPromosEvents.length,
      withRank2: curatedWithPromosEvents.filter((p) => p.promoRank === 2).length,
      withRank1: curatedWithPromosEvents.filter((p) => p.promoRank === 1).length,
      top5: curatedWithPromosEvents.slice(0, 5).map((p) => ({
        name: p.name,
        promoRank: p.promoRank,
        distance: p.distance,
        events: (p.events || []).map((x) => x.kind),
        promos: (p.promotions || []).map((x) => x.kind),
      })),
    });

    // pagination AFTER promo sort
    const start = (pageNum - 1) * perPageNum;
    const pageSlice = curatedWithPromosEvents.slice(start, start + perPageNum);

    const traceIndexInCurated = curatedWithPromosEvents.findIndex(
      (p) => p?.place_id === TRACE_PLACE_ID
    );
    const traceIndexInPage = pageSlice.findIndex((p) => p?.place_id === TRACE_PLACE_ID);

    if (traceIndexInCurated >= 0) {
      trace.stage.inPageSlice = traceIndexInPage >= 0;
      trace.stage.pageIndex = traceIndexInCurated;
      log("TRACE pagination presence", {
        inCurated: true,
        curatedIndex: traceIndexInCurated,
        inPageSlice: traceIndexInPage >= 0,
        page: pageNum,
        perPage: perPageNum,
        pageRange: { start, endExclusive: start + perPageNum },
        traceDistance: curatedWithPromosEvents[traceIndexInCurated]?.distance,
      });
    } else {
      log("TRACE pagination presence", { inCurated: false });
    }

    log("pagination", {
      totalCurated: curatedWithPromosEvents.length,
      page: pageNum,
      perPage: perPageNum,
      startIndex: start,
      pageCount: pageSlice.length,
    });

    // keep your cuisine enrichment step intact
    const enriched = await Promise.all(
      pageSlice.map(async (p) => {
        try {
          const name = p?.name || "";

          const keywordCuisine = classifyRestaurantCuisine(name);
          const reviewCuisine =
            keywordCuisine === "unknown" ? await classifyCuisineFromReviews(p.place_id) : null;
          const languageCuisine =
            keywordCuisine === "unknown" && (reviewCuisine == null || reviewCuisine === "unknown")
              ? await getCuisineFromLanguage(name)
              : null;

          let cuisine = keywordCuisine || languageCuisine || reviewCuisine || "unknown";
          if (cuisine === "unknown" && (p.types || []).includes("bar")) cuisine = "bar_food";

          if (p?.place_id === TRACE_PLACE_ID) {
            log("TRACE enrich", { place_id: p.place_id, name: p.name, cuisine });
          }

          return { ...p, cuisine };
        } catch (e) {
          warn("enrich failed", { place_id: p?.place_id, name: p?.name, message: e?.message });
          return p;
        }
      })
    );

    log("TRACE final", trace);

    log("response", {
      returned: enriched.length,
      meta: { page: pageNum, perPage: perPageNum, total: curatedWithPromosEvents.length },
      elapsedMs: Date.now() - t0,
      traceInResponse: enriched.some((p) => p?.place_id === TRACE_PLACE_ID),
    });

    return res.json({
      curatedPlaces: enriched,
      meta: { page: pageNum, perPage: perPageNum, total: curatedWithPromosEvents.length },
    });
  } catch (error) {
    errlog("endpoint ERROR", { message: error?.message, elapsedMs: Date.now() - t0 });
    log("TRACE final (error)", trace);
    return res.status(500).json({ error: "Something went wrong fetching nearby places." });
  }
});

module.exports = router;
