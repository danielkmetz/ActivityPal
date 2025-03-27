const express = require("express");
const axios = require("axios");
const router = express.Router();

const googleApiKey = process.env.GOOGLE_KEY;

const quickFilters = {
  dateNight: ['top golf', 'escape room'],
  drinksAndDining: ['restaurant', 'bar', 'cafe', 'brewery', 'winery', 'cocktail bar'],
  outdoor: ['park', 'hiking', 'beach', 'lake', 'campground', 'botanical garden'],
  movieNight: ['movie theater', 'drive-in theater', 'IMAX'],
  gaming: ['arcade', 'bowling', 'escape room', 'laser tag'],
  artAndCulture: ['museum', 'art gallery'],
  familyFun: ['amusement park', 'zoo', 'aquarium', 'trampoline park', 'family entertainment', 'museum'],
  petFriendly: ['pet friendly', 'pet friendly restaurant'],
  liveMusic: ['live music venue', 'concert hall', 'jazz club', 'music festival', 'karaoke bar', 'rooftop bar with live music', 'patio', 'outdoor seating'],
  whatsClose: ['establishment', 'entertainment'],
};

const placesTypes = {
  dateNight: ['restaurant', 'bar', 'bowling_alley', 'movie_theater'],
  drinksAndDining: ['restaurant', 'bar', 'cafe'],
  outdoor: ['park', 'campground', 'rv_park', 'tourist_attraction'],
  movieNight: ['movie_theater'],
  gaming: ['amusement_center', 'bowling_alley'],
  artAndCulture: ['museum', 'art_gallery'],
  familyFun: ['amusement_park', 'zoo', 'aquarium'],
  petFriendly: ['park', 'campground', 'rv_park'],
  liveMusic: ['night_club', 'bar', 'casino'],
  whatsClose: ['restaurant', 'cafe', 'bar', 'tourist_attraction', 'entertainment'],
};

router.post("/places", async (req, res) => {
  const { lat, lng, activityType, radius, budget } = req.body;
  const keywords = quickFilters[activityType] || [];
  const types = placesTypes[activityType] || [];

  const allResults = new Map();
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchPlaces = async (paramStr) => {
    const urlBase = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&key=${googleApiKey}${paramStr}`;
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
    console.log(`🔍 Fetching by types: ${types}`);
    await Promise.all(types.map(type =>
      fetchPlaces(`&type=${encodeURIComponent(type)}`)
    ));

    console.log(`🔍 Fetching by keywords: ${keywords}`);
    await Promise.all(keywords.map(keyword =>
      fetchPlaces(`&type=establishment&keyword=${encodeURIComponent(keyword)}`)
    ));

    const haversineDistance = (lat1, lon1, lat2, lon2) => {
      const toRad = (val) => (val * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const filtered = Array.from(allResults.values()).filter(place =>
      !place.types?.includes("school") &&
      !place.types?.includes("doctor") &&
      !place.types?.includes("hospital") &&
      !place.types?.includes("lodging") &&
      !place.types?.includes("airport") &&
      !place.types?.includes("store") &&
      !place.types?.includes("storage") &&
      !place.types?.includes("golf_course") &&
      !place.types?.includes("meal_takeaway") &&
      !place.types?.includes("casino") &&
      !/Country Club|Golf Course|Golf Club|Links/i.test(place.name || "") &&
      !(activityType === "gaming" &&
        (
          place.types?.includes("park") ||
          place.types?.includes("restaurant") ||
          place.types?.includes("meal_takeaway") ||
          place.types?.includes("meal_delivery") ||
          place.types?.includes("cafe") ||
          place.types?.includes("food") ||
          place.types?.includes("bakery") ||
          place.types?.includes("bar")
        )) &&
        (
          (budget === "$" && (place.price_level === 0 || place.price_level === 1)) ||
          (budget === "$$" && (place.price_level <= 2)) ||
          (budget === "$$$" && (place.price_level <= 3)) ||
          (budget === "$$$$")
        )
    );

    const results = filtered.map(place => {
      const distance = haversineDistance(lat, lng, place.geometry.location.lat, place.geometry.location.lng);
      return {
        name: place.name,
        types: place.types,
        address: place.vicinity,
        place_id: place.place_id,
        photoUrl: place.photos
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${googleApiKey}`
          : null,
        distance,
        location: {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        },
      };
    }).sort((a, b) => a.distance - b.distance);

    console.log(`✅ Final curatedPlaces: ${results.length}`);
    res.json({ curatedPlaces: results });

  } catch (error) {
    console.error("🔥 Error in Google Places route:", error.message);
    res.status(500).json({ error: "Something went wrong fetching nearby places." });
  }
});

module.exports = router;
