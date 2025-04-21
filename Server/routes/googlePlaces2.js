const express = require("express");
const axios = require("axios");
const router = express.Router();

const googleApiKey = process.env.GOOGLE_PLACES2;

const quickFilters = {
    dateNight: [
      { type: 'amusement_center' },
      { type: 'movie_theater' },
      { type: 'restaurant' },
      { type: 'bar' },
      { type: 'bowling_alley' },
      { type: 'escape_room' } // fallback included separately
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

router.post("/places-nearby", async (req, res) => {
    const { activityType, quickFilter, lat, lng, radius = 10000, budget } = req.body;
  
    // Fallback to activityTypeKeywords if quickFilter is not provided
    const searchCombos = quickFilter
      ? quickFilters[quickFilter] || []
      : (activityTypeKeywords[activityType] || []).map(type => ({ type }));
  
    const allResults = new Map();
    console.log(allResults);
  
    const toRad = (val) => (val * Math.PI) / 180;
    const haversineDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
  
    const fetchNearbyPlaces = async (type, keyword = '') => {
      try {
        const response = await axios.post(
          'https://places.googleapis.com/v1/places:searchNearby',
          {
            includedTypes: [type],
            keyword: keyword || undefined,
            maxResultCount: 20,
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius: parseInt(radius, 10)
              }
            }
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleApiKey,
              'X-Goog-FieldMask': [
                'places.id',
                'places.displayName',
                'places.types',
                'places.location',
                'places.shortFormattedAddress',
                'places.photos',
                'places.priceLevel'
              ].join(',')
            }
          }
        );
  
        const results = response.data.places || [];
        results.forEach(place => {
          if (!allResults.has(place.id)) {
            allResults.set(place.id, place);
          }
        });
      } catch (err) {
        console.error(`❌ Error fetching nearby places for type="${type}" keyword="${keyword}":`, err.response?.data || err.message);
      }
    };
  
    try {
      await Promise.all(
        searchCombos.map(({ type, keyword }) => fetchNearbyPlaces(type, keyword))
      );
  
      const includeUnpriced = true;
  
      const filtered = Array.from(allResults.values()).filter(place => {
        const distance = haversineDistance(lat, lng, place.location.latitude, place.location.longitude);
        return (
          distance <= radius / 1609.34 &&
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
          !/Country Club|Golf Course|Golf Club|Links/i.test(place.displayName?.text || "") &&
          (
            (includeUnpriced && !place.priceLevel) ||
            (budget === "$" && place.priceLevel <= 1) ||
            (budget === "$$" && place.priceLevel <= 2) ||
            (budget === "$$$" && place.priceLevel <= 3) ||
            (budget === "$$$$")
          )
        );
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
          distance,
          location: {
            lat: place.location.latitude,
            lng: place.location.longitude,
          },
        };
      }).sort((a, b) => a.distance - b.distance);
  
      res.json({ curatedPlaces });
  
    } catch (error) {
      console.error("🔥 Error in /places-nearby:", error.message);
      res.status(500).json({ error: "Something went wrong with the nearby search." });
    }
});
  
module.exports = router;