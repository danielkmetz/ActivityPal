const hardExcludedTypes = new Set([
  "school","doctor","hospital","lodging","airport","storage","casino","gas_station","golf_course",
]);

const softExcludedTypes = new Set(["store"]);

const foodSignalTypes = new Set([
  "restaurant","bar","cafe","bakery","food","meal_takeaway","meal_delivery",
]);

const gasStationNamePattern =
  /\b(speedway|speedy|bp|shell|mobil|exxon|citgo|chevron|amoco|sunoco|marathon|valero|conoco)\b|circle\s?k|thorntons|\b7[-\s]?eleven\b|casey'?s|kum\s?&\s?go|love'?s|pilot|\bqt\b|quiktrip/i;

const countryClubNamePattern = /Country Club|Golf Course|Golf Club|Links/i;

const quickFilters = {
  dateNight: ["top golf","escape room","restaurant","bar","bowling_alley","movie_theater"],
  Dining: ["restaurant","bar","cafe"],
  outdoor: ["park","hiking","beach","lake","campground","botanical garden"],
  movieNight: ["movie theater","drive-in theater","IMAX"],
  gaming: ["arcade","bowling","escape room","laser tag"],
  artAndCulture: ["museum","art gallery"],
  familyFun: ["amusement park","zoo","aquarium","trampoline park","family entertainment","museum"],
  petFriendly: ["pet friendly","pet friendly restaurant"],
  liveMusic: ["live music venue","concert hall","jazz club","music festival","karaoke bar","rooftop bar with live music","patio","outdoor seating"],
  whatsClose: ["establishment","entertainment"],
};

const activityTypeKeywords = {
  Dining: [{ type: "restaurant" }, { type: "bar" }, { type: "cafe" }],
  Entertainment: [
    { type: "movie_theater" },
    { type: "bowling_alley" },
    { type: "amusement_center" },
    { type: "art_gallery" },
    { type: "establishment", keyword: "bowling arcade karaoke escape room comedy club live music" },
  ],
  Outdoor: [
    { type: "park" }, { type: "tourist_attraction" }, { type: "campground" },
    { type: "zoo" }, { type: "aquarium" }, { type: "rv_park" }, { type: "natural_feature" },
  ],
  Indoor: [
    { type: "bowling_alley" }, { type: "museum" }, { type: "aquarium" }, { type: "art_gallery" },
    { type: "gym" }, { type: "movie_theater" }, { type: "casino" }, { type: "amusement_center" },
    { type: "establishment", keyword: "escape room trampoline indoor mini golf" },
  ],
  Family: [
    { type: "zoo" }, { type: "aquarium" }, { type: "museum" }, { type: "park" },
    { type: "amusement_park" }, { type: "playground" },
    { type: "establishment", keyword: "petting zoo trampoline family entertainment children museum" },
  ],
};

module.exports = {
  hardExcludedTypes,
  softExcludedTypes,
  foodSignalTypes,
  gasStationNamePattern,
  countryClubNamePattern,
  quickFilters,
  activityTypeKeywords,
};
