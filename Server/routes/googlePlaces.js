const express = require("express");
const axios = require("axios");
const router = express.Router();
const { isFastFood } = require('../utils/isFastFood');
const { classifyRestaurantCuisine } = require('../RestaurantClass/Keywords/Keywords');
const { getCuisineFromLanguage } = require('../RestaurantClass/Language');
const { classifyCuisineFromReviews } = require('../RestaurantClass/ByReview');

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
  const { lat, lng, activityType, radius, budget, isCustom } = req.body;
  console.log('radius', radius);

  const searchCombos = isCustom
    ? activityTypeKeywords[activityType] || []
    : (quickFilters[activityType] || []).map(k => ({ type: 'establishment', keyword: k }));

  const allResults = new Map();
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchPlaces = async (type, keyword) => {
    const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : '';
    const urlBase = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${googleApiKey}${keywordParam}`;

    let pageToken = null;
    let pages = 0;

    do {
      const fullUrl = `${urlBase}${pageToken ? `&pagetoken=${pageToken}` : ""}`;
      const response = await axios.get(fullUrl);
      const { results, next_page_token } = response.data;

      results?.forEach(place => {
        if (!allResults.has(place.place_id)) {
          allResults.set(place.place_id, place);
        }
      });

      pageToken = next_page_token;
      pages++;
      if (pageToken) await delay(2000);
    } while (pageToken && pages < 3);
  };

  try {
    await Promise.all(searchCombos.map(({ type, keyword }) => fetchPlaces(type, keyword)));

    const haversineDistance = (lat1, lon1, lat2, lon2) => {
      const toRad = (val) => (val * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const gasStationNamePattern = /speedy|speedway|bp|shell|mobil|exxon|citgo|chevron|circle\s?k|thorntons|amoco|7-eleven|7 eleven|casey's|caseys|kum\s?&\s?go|love's|loves|pilot|sunoco|marathon|quiktrip|qt|valero|conoco/i;

    const filtered = Array.from(allResults.values()).filter(place =>
      !place.types?.includes("school") &&
      !place.types?.includes("doctor") &&
      !place.types?.includes("hospital") &&
      !place.types?.includes("lodging") &&
      !place.types?.includes("airport") &&
      !place.types?.includes("store") &&
      !place.types?.includes("storage") &&
      !place.types?.includes("golf_course") &&
      !place.types?.includes("casino") &&
      !place.types?.includes("gas_station") &&
      !gasStationNamePattern.test(place.name || "") &&
      !/Country Club|Golf Course|Golf Club|Links/i.test(place.name || "") &&
      !isFastFood(place.name || "") &&
      (
        (budget === "$" && (place.price_level === 0 || place.price_level === 1)) ||
        (budget === "$$" && (place.price_level <= 2)) ||
        (budget === "$$$" && (place.price_level <= 3)) ||
        (budget === "$$$$")
      )
    );

    const results = await Promise.all(filtered.map(async (place) => {
      const distanceKm = haversineDistance(lat, lng, place.geometry.location.lat, place.geometry.location.lng);
      const distanceMiles = distanceKm * 0.621371;
      const radiusInMiles = radius / 1609.34;

      if (distanceMiles > radiusInMiles) return null;

      const name = place.name || '';
      const keywordCuisine = classifyRestaurantCuisine(name);
      const reviewCuisine =
        keywordCuisine === "unknown" ? await classifyCuisineFromReviews(place.place_id) : null;
      const languageCuisine =
        keywordCuisine === "unknown" && reviewCuisine === "unknown"
          ? await getCuisineFromLanguage(name)
          : null;

      let cuisine = keywordCuisine || languageCuisine || reviewCuisine || 'unknown';

      if (cuisine === "unknown" && place.types?.includes("bar")) {
        cuisine = "bar_food";
      }

      return {
        name: place.name,
        cuisine,
        types: place.types,
        address: place.vicinity,
        place_id: place.place_id,
        opening_hours: place.opening_hours,
        photoUrl: place.photos
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${googleApiKey}`
          : null,
        distance: distanceMiles,
        location: {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        },
      };
    }));
    const filteredResults = results.filter(Boolean);

    filteredResults.sort((a, b) => a.distance - b.distance);

    const cuisineCounts = filteredResults.reduce((acc, place) => {
      const label = place.cuisine || 'unknown';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});

    console.log("📊 Cuisine category breakdown:");
    Object.entries(cuisineCounts).forEach(([cuisine, count]) => {
      console.log(` - ${cuisine}: ${count}`);
    });

    console.log(`✅ Final curatedPlaces: ${filteredResults.length}`);
    res.json({ curatedPlaces: filteredResults });
  } catch (error) {
    console.error("🔥 Error in Google Places route:", error.message);
    res.status(500).json({ error: "Something went wrong fetching nearby places." });
  }
});

module.exports = router;
