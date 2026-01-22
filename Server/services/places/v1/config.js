const quickFilters = {
  dateNight: [
    { type: "wine_bar" },
    { type: "comedy_club" },
    { type: "movie_theater" },
    { type: "restaurant" },
    { type: "bar" },
    { type: "bowling_alley" },
  ],
  drinksAndDining: [{ type: "restaurant" }, { type: "bar" }, { type: "cafe" }],
  outdoor: [
    { type: "park" },
    { type: "natural_feature" },
    { type: "campground" },
    { type: "tourist_attraction" },
  ],
  movieNight: [{ type: "movie_theater" }],
  gaming: [{ type: "amusement_center" }, { type: "bowling_alley" }],
  artAndCulture: [{ type: "museum" }, { type: "art_gallery" }],
  familyFun: [
    { type: "amusement_park" },
    { type: "zoo" },
    { type: "aquarium" },
    { type: "amusement_center" },
    { type: "museum" },
    { type: "playground" },
  ],
  petFriendly: [{ type: "park" }],
  liveMusic: [{ type: "bar" }, { type: "night_club" }],
  whatsClose: [{ type: "establishment" }],
};

const activityTypeKeywords = {
  Dining: ["restaurant", "bar", "meal_delivery", "meal_takeaway", "cafe"],
  Entertainment: ["movie_theater", "bowling_alley", "amusement_center", "topgolf"],
  Outdoor: ["park", "tourist_attraction", "campground", "zoo", "natural_feature"],
  Indoor: ["bowling_alley", "museum", "aquarium", "art_gallery", "movie_theater", "amusement_center"],
  Family: ["zoo", "aquarium", "museum", "park", "amusement_park", "playground", "amusement_center"],
};

const EXCLUDED_TYPES = [
  "school",
  "doctor",
  "hospital",
  "lodging",
  "airport",
  "store",
  "storage",
  "golf_course",
  "meal_takeaway",
  "casino",
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
  return null;
}

function buildSearchCombos({ activityType, quickFilter }) {
  if (quickFilter) return quickFilters[quickFilter] || [];
  return (activityTypeKeywords[activityType] || []).map((t) => ({ type: t }));
}

module.exports = {
  quickFilters,
  activityTypeKeywords,
  EXCLUDED_TYPES,
  PRICE_LEVEL_TO_TIER,
  budgetToMaxTier,
  buildSearchCombos,
};
