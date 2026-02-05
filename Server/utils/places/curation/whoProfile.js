const WHO_VALUES = new Set(["solo", "date", "friends", "family"]);

function normalizeWho(v) {
  const w = String(v || "").toLowerCase().trim();
  return WHO_VALUES.has(w) ? w : null;
}

function dedupe(arr) {
  return Array.from(new Set((Array.isArray(arr) ? arr : []).filter(Boolean)));
}

function getTypeSet(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  const primary = place?.primaryType ? [place.primaryType] : [];
  return new Set([...types, ...primary].filter(Boolean));
}

// Defensive boolean read (covers accidental non-boolean shapes)
function isTrue(v) {
  if (v === true) return true;
  if (v === false) return false;
  // sometimes devs pass { value: true } / { enabled: true } etc
  if (v && typeof v === "object") {
    if (v.value === true) return true;
    if (v.value === false) return false;
  }
  return null; // unknown
}

function buildWhoProfile({ who, placeCategory } = {}) {
  const base = {
    hardExclude: [],
    boostTypes: [],
    penalizeTypes: [],
    boostAttrs: {},

    // If an attribute is explicitly false, you can guardrail-reject.
    // (Unknown/null should NOT reject; only explicit false)
    disallowIfFalseAttrs: [],

    // (optional) weights if you later blend whoScore into a larger ranker
    weights: {
      who: 1.0,
      rating: 0.6,
      promos: 0.8,
      openAtTarget: 0.7,
      distance: 0.5,
    },
  };

  if (!who) return base;

  if (who === "solo") {
    base.boostTypes.push(
      "cafe",
      "library",
      "book_store",
      "park",
      "museum",
      "art_gallery"
    );
    // “penalize” is better than hard-exclude for solo; people still go out solo.
    base.penalizeTypes.push("night_club", "casino");
    base.weights.distance = 0.7;
  }

  if (who === "date") {
    base.boostTypes.push(
      "restaurant",
      "art_gallery",
      "performing_arts_theater",
      "movie_theater",
      "tourist_attraction"
    );
    base.penalizeTypes.push("fast_food_restaurant", "meal_takeaway", "gas_station");
    base.boostAttrs.reservable = 1;
    base.boostAttrs.outdoorSeating = 1;
    base.boostAttrs.liveMusic = 1;
    base.weights.rating = 0.9;
    base.weights.distance = 0.4;
  }

  if (who === "friends") {
    base.boostTypes.push("bar", "bowling_alley", "movie_theater", "amusement_park");
    base.boostAttrs.goodForGroups = 2;
    base.boostAttrs.liveMusic = 1;
    base.boostAttrs.goodForWatchingSports = 1;
    base.weights.distance = 0.5;
  }

  if (who === "family") {
    // These are reasonable hard excludes; don’t be shy here.
    base.hardExclude.push("night_club", "casino");

    base.boostTypes.push(
      "park",
      "zoo",
      "aquarium",
      "museum",
      "movie_theater",
      "amusement_park",
      "playground",
      "bowling_alley",
    );

    base.boostAttrs.goodForChildren = 3;
    base.boostAttrs.menuForChildren = 1;

    // If the API explicitly says “not good for children”, drop it.
    base.disallowIfFalseAttrs.push("goodForChildren");

    // Bars: usually bad for family, but don’t hard-ban; just penalize.
    base.penalizeTypes.push("bar");
    base.weights.rating = 0.8;
    base.weights.distance = 0.6;
  }

  // Don’t fight the user’s explicit category choice:
  // If they picked nightlife + family, loosen the bar penalty (still keep night_club/casino excluded).
  if (placeCategory === "nightlife" && who === "family") {
    base.penalizeTypes = base.penalizeTypes.filter((t) => t !== "bar");
  }

  // sanitize
  base.hardExclude = dedupe(base.hardExclude);
  base.boostTypes = dedupe(base.boostTypes);
  base.penalizeTypes = dedupe(base.penalizeTypes);

  return base;
}

function passesWhoGuardrails(place, profile) {
  const typeSet = getTypeSet(place);

  // hard type rejects
  const hard = Array.isArray(profile?.hardExclude) ? profile.hardExclude : [];
  for (const t of hard) if (typeSet.has(t)) return false;

  // attribute-based rejects (only reject on explicit false)
  const disallowIfFalse = Array.isArray(profile?.disallowIfFalseAttrs)
    ? profile.disallowIfFalseAttrs
    : [];

  for (const k of disallowIfFalse) {
    const v = isTrue(place?.[k]);
    if (v === false) return false;
  }

  return true;
}

function scorePlaceForWho(place, profile) {
  const typeSet = getTypeSet(place);
  let s = 0;

  const boostTypes = Array.isArray(profile?.boostTypes) ? profile.boostTypes : [];
  const penalizeTypes = Array.isArray(profile?.penalizeTypes) ? profile.penalizeTypes : [];

  for (const t of boostTypes) if (typeSet.has(t)) s += 2;
  for (const t of penalizeTypes) if (typeSet.has(t)) s -= 2;

  const attrs = profile?.boostAttrs && typeof profile.boostAttrs === "object" ? profile.boostAttrs : {};
  for (const k of Object.keys(attrs)) {
    const v = isTrue(place?.[k]);
    if (v === true) s += Number(attrs[k]) || 0;
  }

  // Clamp so whoScore doesn’t dominate everything by accident
  if (s > 10) s = 10;
  if (s < -10) s = -10;

  return s;
}

module.exports = {
  normalizeWho,
  buildWhoProfile,
  passesWhoGuardrails,
  scorePlaceForWho,
};
