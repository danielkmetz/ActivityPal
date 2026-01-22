const KID_NAME_RE =
  /\b(kid|kids|child|children|toddler|birthday|bday|play\s?place|playplace|trampoline|bounce|jump|urban\s?air|kids\s?empire|epic\s?air)\b/i;

const KID_TYPES = new Set([
  // choose only types you actually see in responses
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
  "pub",
  "night_club",
  "restaurant",
  "fine_dining_restaurant",
  "movie_theater",
  "comedy_club",
  "concert_hall",
  "performing_arts_theater",
  "karaoke",
]);

function isDateNightReject(place) {
  // ✅ Support both:
  // - mapped objects { name, types }
  // - raw Places objects { displayName: { text }, types }
  const name = String(place?.name || place?.displayName?.text || "");
  const types = Array.isArray(place?.types) ? place.types : [];

  if (KID_NAME_RE.test(name)) return { reject: true, reason: "kid_name" };

  // If it looks like a kid venue AND doesn’t have adult signals, reject it.
  const hasKidType = types.some((t) => KID_TYPES.has(t));
  const hasAdultSignal = types.some((t) => ADULT_SIGNAL_TYPES.has(t));
  if (hasKidType && !hasAdultSignal) return { reject: true, reason: "kid_type" };

  return { reject: false, reason: null };
}

module.exports = { isDateNightReject };
