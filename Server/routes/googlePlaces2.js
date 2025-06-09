const express = require("express");
const axios = require("axios");
const router = express.Router();
const Business = require('../models/Business');
const { enrichBusinessWithPromosAndEvents } = require("../utils/enrichBusinesses");

const googleApiKey = process.env.GOOGLE_PLACES2;

const EARTH_RADIUS_M = 6371000; // Earth's radius in meters
const MAX_DISTANCE_METERS = 8046.72; // 5 miles
const toRad = deg => (deg * Math.PI) / 180;

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
};

const quickFilters = {
  dateNight: [
    { type: 'amusement_center' },
    { type: 'movie_theater' },
    { type: 'restaurant' },
    { type: 'bar' },
    { type: 'bowling_alley' },
  ],

  drinksAndDining: [
    { type: 'restaurant' },
    { type: 'bar' },
    { type: 'cafe' }
  ],

  outdoor: [
    { type: 'park' },
    { type: 'natural_feature' },
    { type: 'campground' },
    { type: 'tourist_attraction' }
  ],

  movieNight: [
    { type: 'movie_theater' }
  ],

  gaming: [
    { type: 'amusement_center' },
    { type: 'bowling_alley' }
  ],

  artAndCulture: [
    { type: 'museum' },
    { type: 'art_gallery' }
  ],

  familyFun: [
    { type: 'amusement_park' },
    { type: 'zoo' },
    { type: 'aquarium' },
    { type: 'amusement_center' },
    { type: 'museum' },
    { type: 'playground' }
  ],

  petFriendly: [
    { type: 'park' } // filter for pet friendliness in logic
  ],

  liveMusic: [
    { type: 'bar' },
    { type: 'night_club' }
  ],

  whatsClose: [
    { type: 'establishment' }
  ]
};

const activityTypeKeywords = {
  Dining: ["restaurant", "bar", "meal_delivery", "meal_takeaway", "cafe"],
  Entertainment: ["movie_theater", "bowling_alley", "amusement_center", "topgolf", 'amusement_center'],
  Outdoor: ["park", "tourist_attraction", "campground", "zoo", "natural_feature"],
  Indoor: ["bowling_alley", "museum", "aquarium", "art_gallery", "movie_theater", "amusement_center"],
  Family: ["zoo", "aquarium", "museum", "park", "amusement_park", "playground", "amusement_center"],
};

async function fetchNearbyPlaces({ lat, lng, radius = 8046.72, type }) {
  const allResults = new Map();

  console.log("📍 fetchNearbyPlaces called with:", { lat, lng, radius, type });

  try {
    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        includedTypes: [type],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: parseInt(radius, 10),
          },
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": googleApiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.types",
            "places.location",
            "places.shortFormattedAddress",
            "places.photos",
            "places.priceLevel",
          ].join(","),
        },
      }
    );

    const results = response.data.places || [];
    console.log(`✅ Received ${results.length} places from Google Places API`);

    results.forEach(place => {
      if (!allResults.has(place.id)) {
        allResults.set(place.id, place);
      }
    });

    return Array.from(allResults.values());

  } catch (err) {
    console.error("❌ Error fetching from Google Places:", err.response?.data || err.message);
    return [];
  }
}

router.post("/places-nearby", async (req, res) => {
  const { activityType, quickFilter, lat, lng, radius = 10000, budget } = req.body;

  const searchCombos = quickFilter
    ? quickFilters[quickFilter] || []
    : (activityTypeKeywords[activityType] || []).map(type => ({ type }));

  const includeUnpriced = true;
  const allResults = new Map();

  try {
    await Promise.all(
      searchCombos.map(async ({ type, keyword }) => {
        const results = await fetchNearbyPlaces({ type, keyword, lat, lng, radius });

        results.forEach(place => {
          if (!allResults.has(place.id)) {
            allResults.set(place.id, place);
          }
        });
      })
    );

    const filtered = Array.from(allResults.values()).filter(place => {
      const distance = haversineDistance(lat, lng, place.location.latitude, place.location.longitude);

      const isExcludedType = [
        "school", "doctor", "hospital", "lodging", "airport", "store", "storage",
        "golf_course", "meal_takeaway", "casino"
      ].some(type => place.types?.includes(type));

      const isExcludedByName = /Country Club|Golf Course|Golf Club|Links/i.test(place.displayName?.text || "");

      const priceOk =
        (includeUnpriced && place.priceLevel == null) ||
        (budget === "$" && place.priceLevel <= 1) ||
        (budget === "$$" && place.priceLevel <= 2) ||
        (budget === "$$$" && place.priceLevel <= 3) ||
        (budget === "$$$$");

      const withinDistance = distance <= radius;

      return !(isExcludedType || isExcludedByName || !priceOk || !withinDistance);
    });

    const curatedPlaces = filtered.map(place => {
      const distance = haversineDistance(lat, lng, place.location.latitude, place.location.longitude);
      return {
        name: place.displayName?.text,
        types: place.types,
        address: place.shortFormattedAddress,
        place_id: place.id,
        photoUrl: place.photos?.[0]?.name
          ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=400&key=${googleApiKey}`
          : null,
        distance: +(distance / 1609.34).toFixed(2),
        location: {
          lat: place.location.latitude,
          lng: place.location.longitude,
        },
      };
    }).sort((a, b) => a.distance - b.distance);

    res.json({ curatedPlaces });

  } catch (error) {
    res.status(500).json({ error: "Something went wrong with the nearby search." });
  }
});

router.post("/events-and-promos-nearby", async (req, res) => {
  const { lat, lng } = req.body;

  console.log("📍 Incoming request to /events-and-promos-nearby with coords:", { lat, lng });

  if (typeof lat !== "number" || typeof lng !== "number") {
    console.warn("❗ Invalid or missing lat/lng in request body.");
    return res.status(400).json({ error: "Missing or invalid lat/lng" });
  }

  try {
    // Step 1: Geospatial query to find nearby businesses
    const nearbyBusinesses = await Business.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          $maxDistance: MAX_DISTANCE_METERS,
        },
      },
    });

    console.log(`✅ Found ${nearbyBusinesses.length} nearby businesses within ${MAX_DISTANCE_METERS} miles.`);

    // Step 2: Filter for businesses with active promos or events
    const flattenedSuggestions = [];

    for (const biz of nearbyBusinesses) {
      try {
        const enrichedBiz = await enrichBusinessWithPromosAndEvents(biz, lat, lng);
        if (!enrichedBiz) continue;

        const {
          businessName,
          placeId,
          location,
          logoUrl,
          bannerUrl,
          distance,
          activePromo,
          upcomingPromo,
          activeEvent,
          upcomingEvent,
        } = enrichedBiz;

        const shared = { type: 'suggestion', businessName, placeId, location, logoUrl, bannerUrl, distance };

        const pushIfExists = (entry, kind) => {
          if (entry) flattenedSuggestions.push({ ...shared, ...entry, kind });
        };

        pushIfExists(activePromo, 'activePromo');
        pushIfExists(upcomingPromo, 'upcomingPromo');
        pushIfExists(activeEvent, 'activeEvent');
        pushIfExists(upcomingEvent, 'upcomingEvent');

      } catch (e) {
        console.error(`❌ Error enriching business "${biz.businessName}":`, e);
      }
    }

    console.log(`🎯 Returning ${flattenedSuggestions.length} flattened suggestions.`);
    res.json({ suggestions: flattenedSuggestions });
  } catch (err) {
    console.error("🔥 Error in /events-and-promos-nearby:", err.stack || err);
    res.status(500).json({ error: "Failed to fetch active promos/events nearby." });
  }
});

module.exports = router;