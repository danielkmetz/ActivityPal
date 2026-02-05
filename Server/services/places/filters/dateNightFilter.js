const { isFastFood, matchFastFoodChain } = require("../../../utils/places/curation/isFastFood"); 

const KID_NAME_RE = /\b(kid|kids|child|children|toddler|birthday|bday|play\s?place|playplace|trampoline|bounce|jump|urban\s?air|kids\s?empire|epic\s?air)\b/i;

const KID_TYPES = new Set([
  "playground",
  "amusement_park",
  "water_park",
  "zoo",
  "aquarium",
  "recreation_center",
  "sports_complex",
  "campground",
]);

const ADULT_SIGNAL_TYPES = new Set([
  "bar",
  "wine_bar",
  "night_club",
  "restaurant",
  "fine_dining_restaurant",
  "movie_theater",
  "comedy_club",
  "concert_hall",
  "performing_arts_theater",
  "karaoke",
]);

const FAST_FOOD_TYPES = new Set([
  "fast_food_restaurant",
  "meal_takeaway",
  "meal_delivery",
  "sandwich_shop",
]);

function getPlaceName(place) {
  return String(place?.name || place?.displayName?.text || "");
}

function getPlaceTypes(place) {
  return Array.isArray(place?.types) ? place.types : [];
}

function isDateNightReject(place, ctx = {}) {
  const name = getPlaceName(place);
  const types = getPlaceTypes(place);

  // 1) Hard reject by types when Google labels it clearly
  if (types.some((t) => FAST_FOOD_TYPES.has(t))) {
    return { reject: true, reason: "fast_food_type" };
  }

  // 2) Hard reject by name using YOUR string-based matcher
  if (isFastFood(name)) {
    // optional debug hook
    if (ctx?.log) ctx.log("dateNight fastFood reject", { name, chain: matchFastFoodChain(name) });
    return { reject: true, reason: "fast_food_name" };
  }

  // existing kid filter
  if (KID_NAME_RE.test(name)) return { reject: true, reason: "kid_name" };

  const hasKidType = types.some((t) => KID_TYPES.has(t));
  const hasAdultSignal = types.some((t) => ADULT_SIGNAL_TYPES.has(t));
  if (hasKidType && !hasAdultSignal) return { reject: true, reason: "kid_type" };

  return { reject: false, reason: null };
}

module.exports = { isDateNightReject };
