const hardExcludedTypes = new Set([
  "school",
  "doctor",
  "hospital",
  "lodging",
  "airport",
  "storage",
  "gas_station",
]);

const softExcludedTypes = new Set(["store"]);

const foodSignalTypes = new Set([
  "restaurant",
  "bar",
  "cafe",
  "bakery",
  "food",
  "meal_takeaway",
  "meal_delivery",
]);

const gasStationNamePattern = /\b(speedway|speedy|bp|shell|mobil|exxon|citgo|chevron|amoco|sunoco|marathon|valero|conoco)\b|circle\s?k|thorntons|\b7[-\s]?eleven\b|casey'?s|kum\s?&\s?go|love'?s|pilot|\bqt\b|quiktrip/i;

const countryClubNamePattern = /Country Club|Golf Course|Golf Club|Links/i;

const QUICK_FILTER_COMBOS = {
  dateNight: [
    { type: "establishment", keyword: "topgolf" },
    { type: "establishment", keyword: "escape room" },
    { type: "bowling_alley" },
    { type: "movie_theater" },
    { type: "restaurant" },
    { type: "bar" },
  ],
  drinksAndDining: [
    { type: "restaurant" },
    { type: "bar" },
    { type: "cafe" },
    { type: "establishment", keyword: "cocktail bar wine bar brewery" },
  ],
  outdoor: [
    { type: "park" },
    { type: "tourist_attraction" },
    { type: "campground" },
    { type: "natural_feature" },
    { type: "botanical_garden" },
  ],
  movieNight: [
    { type: "movie_theater" },
    { type: "establishment", keyword: "drive-in movie theater imax" },
  ],
  gaming: [
    { type: "establishment", keyword: "arcade" },
    { type: "bowling_alley" },
    { type: "establishment", keyword: "laser tag" },
    { type: "establishment", keyword: "escape room" },
  ],
  artAndCulture: [
    { type: "museum" },
    { type: "art_gallery" },
    { type: "establishment", keyword: "theater performing arts" },
  ],
  familyFun: [
    { type: "zoo" },
    { type: "aquarium" },
    { type: "museum" },
    { type: "park" },
    { type: "amusement_park" },
    { type: "establishment", keyword: "trampoline park family entertainment" },
  ],
  petFriendly: [
    // there is no reliable “pet friendly” type, so keyword it
    { type: "establishment", keyword: "pet friendly" },
    { type: "park" },
  ],
  liveMusic: [
    // avoid relying on dubious types; keyword is safer
    { type: "establishment", keyword: "live music" },
    { type: "establishment", keyword: "jazz" },
    { type: "establishment", keyword: "concert" },
    { type: "bar" }, // often works better than "night_club"
  ],
  whatsClose: [{ type: "establishment" }],
};

// Place categories for your NEW modal model.
// These should line up with PLACE_CATEGORY_OPTIONS values (ex: "food_drink").
const PLACE_CATEGORY_COMBOS = {
  food_drink: [{ type: "restaurant" }, { type: "bar" }, { type: "cafe" }],
  entertainment: [
    { type: "movie_theater" },
    { type: "bowling_alley" },
    { type: "museum" },
    { type: "art_gallery" },
    { type: "tourist_attraction" },
    { type: "establishment", keyword: "escape room comedy club arcade" },
    // NOTE: casino is NOT hard-excluded anymore — let prefs handle it
    { type: "casino" },
  ],
  outdoor: [
    { type: "park" },
    { type: "natural_feature" },
    { type: "campground" },
    { type: "tourist_attraction" },
    { type: "botanical_garden" },
  ],
  indoor: [
    { type: "museum" },
    { type: "art_gallery" },
    { type: "movie_theater" },
    { type: "bowling_alley" },
    { type: "gym" },
    { type: "aquarium" },
    { type: "casino" },
    { type: "establishment", keyword: "escape room indoor mini golf trampoline" },
  ],
  family: [
    { type: "zoo" },
    { type: "aquarium" },
    { type: "museum" },
    { type: "park" },
    { type: "amusement_park" },
    { type: "establishment", keyword: "children museum family entertainment playground" },
  ],
  any: [{ type: "establishment" }],
};

// If you still use these older keys elsewhere, keep them but point them to the new maps.
// (This avoids breaking imports while you migrate.)
const quickFilters = Object.fromEntries(
  Object.entries(QUICK_FILTER_COMBOS).map(([k, combos]) => [
    k,
    combos.map((c) => c.keyword || c.type),
  ])
);

// Legacy “activityTypeKeywords” — keep if your old code uses it.
// But these should now be combos, not random strings.
const activityTypeKeywords = {
  Dining: PLACE_CATEGORY_COMBOS.food_drink,
  Entertainment: PLACE_CATEGORY_COMBOS.entertainment,
  Outdoor: PLACE_CATEGORY_COMBOS.outdoor,
  Indoor: PLACE_CATEGORY_COMBOS.indoor,
  Family: PLACE_CATEGORY_COMBOS.family,
};

module.exports = {
  hardExcludedTypes,
  softExcludedTypes,
  foodSignalTypes,
  gasStationNamePattern,
  countryClubNamePattern,
  QUICK_FILTER_COMBOS,
  PLACE_CATEGORY_COMBOS,
  quickFilters,
  activityTypeKeywords,
};
