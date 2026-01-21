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
  const t0 = Date.now();

  const { lat, lng, activityType, radius, budget, isCustom } = req.body;

  const pageNum = Math.max(1, Number(req.body.page || 1));
  const perPageNum = Math.min(25, Math.max(5, Number(req.body.perPage || 15)));

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const radiusMeters = Number(radius);

  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
    return res.status(400).json({ error: "Invalid lat/lng" });
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) {
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

  if (!Array.isArray(searchCombos) || searchCombos.length === 0) {
    return res.json({
      curatedPlaces: [],
      meta: { page: pageNum, perPage: perPageNum, total: 0 },
    });
  }

  const allResults = new Map();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchPlaces = async (type, keyword) => {
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

      try {
        const response = await axios.get(fullUrl);
        const data = response?.data || {};
        const status = data?.status;

        if (status !== "OK") break;

        const results = Array.isArray(data?.results) ? data.results : [];
        const next = data?.next_page_token || null;

        for (const place of results) {
          const id = place?.place_id;
          if (!id) continue;
          if (allResults.has(id)) continue;
          allResults.set(id, place);
        }

        pageToken = next;
        pages += 1;

        if (pageToken) await delay(2000);
      } catch {
        break;
      }
    } while (pageToken && pages < 3);
  };

  try {
    await Promise.all(searchCombos.map(({ type, keyword }) => fetchPlaces(type, keyword)));

    if (allResults.size === 0) {
      return res.json({
        curatedPlaces: [],
        meta: { page: pageNum, perPage: perPageNum, total: 0 },
      });
    }

    const gasStationNamePattern =
      /speedy|speedway|bp|shell|mobil|exxon|citgo|chevron|circle\s?k|thorntons|amoco|7-eleven|7 eleven|casey's|caseys|kum\s?&\s?go|love's|loves|pilot|sunoco|marathon|quiktrip|qt|valero|conoco/i;

    const filtered = Array.from(allResults.values()).filter((place) => {
      const name = place?.name || "";

      const hasExcludedType = place.types?.some((t) =>
        [
          "school",
          "doctor",
          "hospital",
          "lodging",
          "airport",
          "store",
          "storage",
          "golf_course",
          "casino",
          "gas_station",
        ].includes(t)
      );
      if (hasExcludedType) return false;
      if (gasStationNamePattern.test(name)) return false;
      if (/Country Club|Golf Course|Golf Club|Links/i.test(name)) return false;
      if (isFastFood(name)) return false;

      const budgetFiltered =
        (budget === "$" && !(place.price_level === 0 || place.price_level === 1)) ||
        (budget === "$$" && !(place.price_level <= 2)) ||
        (budget === "$$$" && !(place.price_level <= 3)) ||
        (budget === "$$$$" && place.price_level > 4);

      if (budgetFiltered) return false;

      return true;
    });

    const curatedPlaces = [];
    for (const place of filtered) {
      const id = place?.place_id;
      const pLat = Number(place?.geometry?.location?.lat);
      const pLng = Number(place?.geometry?.location?.lng);

      if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;

      const distanceMeters = haversineDistance(latNum, lngNum, pLat, pLng);
      if (distanceMeters > radiusMeters) continue;

      const distanceMiles = distanceMeters / 1609.34;

      const openNow =
        typeof place?.opening_hours?.open_now === "boolean"
          ? place.opening_hours.open_now
          : null;

      const photoName = place?.photos?.[0]?.photo_reference || null;

      curatedPlaces.push({
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
      });
    }

    curatedPlaces.sort((a, b) => a.distance - b.distance);

    // ✅ HYDRATE + PRIORITIZE
    const now = new Date();
    const { hydrated } = await hydratePlacesWithPromosEvents({ places: curatedPlaces, now });
    const curatedWithPromosEvents = sortPlacesByPromoThenDistance(hydrated);

    // pagination AFTER promo sort
    const start = (pageNum - 1) * perPageNum;
    const pageSlice = curatedWithPromosEvents.slice(start, start + perPageNum);

    // cuisine enrichment
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

          return { ...p, cuisine };
        } catch {
          return p;
        }
      })
    );

    return res.json({
      curatedPlaces: enriched,
      meta: { page: pageNum, perPage: perPageNum, total: curatedWithPromosEvents.length },
    });
  } catch {
    return res.status(500).json({ error: "Something went wrong fetching nearby places." });
  }
});

module.exports = router;
