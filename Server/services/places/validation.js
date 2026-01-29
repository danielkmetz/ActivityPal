function parseCursor(raw) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parsePerPage(raw, { MIN_PER_PAGE, MAX_PER_PAGE }) {
  const n = Number(raw || 15);
  if (!Number.isFinite(n)) return MIN_PER_PAGE;
  return Math.min(MAX_PER_PAGE, Math.max(MIN_PER_PAGE, Math.floor(n)));
}

function parseBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

function parseEnum(v, allowedSet, fallback = null) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return fallback;
  return allowedSet.has(s) ? s : fallback;
}

function parseNullableString(v, { maxLen = 120 } = {}) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function parseBudget(v) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (s === "$" || s === "$$" || s === "$$$" || s === "$$$$") return s;
  return null;
}

function parseVibes(v) {
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const it of v) {
    if (typeof it !== "string") continue;
    const s = it.trim();
    if (!s) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= 2) break; // hard cap
  }
  return out.length ? out : null;
}

// supports either: "today" | "weekend" | etc OR { kind: "date", date: "YYYY-MM-DD" }
function parseWhen(v) {
  if (v && typeof v === "object") {
    const kind = parseEnum(v.kind, new Set(["date"]), null);
    const date = parseNullableString(v.date, { maxLen: 32 });
    if (kind === "date" && date) return { kind, date };
    return null;
  }

  // allowlist is safer than free-form strings
  const allowed = new Set(["any", "today", "tomorrow", "this_weekend", "weekend", "date"]);
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s === "any") return null;
  return allowed.has(s) ? s : null;
}

function parsePlacesFilters(v) {
  if (!v || typeof v !== "object") return null;

  const avoid = v.avoid && typeof v.avoid === "object" ? v.avoid : {};

  const minRatingRaw = v.minRating;
  const minRating =
    typeof minRatingRaw === "number" && Number.isFinite(minRatingRaw)
      ? Math.min(5, Math.max(0, minRatingRaw))
      : null;

  return {
    openNowOnly: parseBool(v.openNowOnly, false),
    minRating: minRating, // null means "ignore"
    outdoorSeating: parseBool(v.outdoorSeating, false),
    liveMusic: parseBool(v.liveMusic, false),
    reservable: parseBool(v.reservable, false),
    dogFriendly: parseBool(v.dogFriendly, false),
    avoid: {
      chains: parseBool(avoid.chains, false),
      fastFood: parseBool(avoid.fastFood, false),
      bars: parseBool(avoid.bars, false),
    },
  };
}

function parseEventFilters(v) {
  if (!v || typeof v !== "object") return null;

  const sort = parseEnum(v.sort, new Set(["date", "distance", "relevance"]), "date");

  // keep category as a string (your event categories will evolve)
  const category = parseNullableString(v.category, { maxLen: 40 });

  return {
    category: category || null,
    freeOnly: parseBool(v.freeOnly, false),
    sort,
  };
}

function validateNewSearchBody(body) {
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);

  // Accept either `radius` or `radiusMeters`
  const radiusMeters = Number(
    typeof body?.radiusMeters !== "undefined" ? body.radiusMeters : body?.radius
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, status: 400, error: "Invalid lat/lng" };
  }

  // Keep your cap (50km)
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) {
    return {
      ok: false,
      status: 400,
      error: "Invalid radius (meters). Must be 0 < radius <= 50000",
    };
  }

  const mode = parseEnum(body?.mode, new Set(["places", "events", "mixed"]), "places");

  // Your new categories (expand later without breaking)
  const placeCategory = parseEnum(
    body?.placeCategory,
    new Set(["any", "food_drink", "entertainment", "outdoor", "indoor", "family"]),
    null
  );
  const eventCategory = parseNullableString(body?.eventCategory, { maxLen: 40 });

  // Back-compat: you still use `activityType` in cursor state today
  const activityType = parseNullableString(body?.activityType, { maxLen: 40 });
  const quickFilter = parseNullableString(body?.quickFilter, { maxLen: 40 });

  const budget = parseBudget(body?.budget);
  const isCustom = parseBool(body?.isCustom, false);

  // keep your existing diningMode contract
  const diningModeRaw = typeof body?.diningMode === "string" ? body.diningMode.trim() : "";
  const diningMode =
    diningModeRaw === "quick_bite" || diningModeRaw === "quickbite" || diningModeRaw === "quick"
      ? "quick_bite"
      : diningModeRaw
        ? "sit_down"
        : undefined;

  const when = parseWhen(body?.when);
  const who = parseNullableString(body?.who, { maxLen: 40 });
  const vibes = parseVibes(body?.vibes);

  const keyword = parseNullableString(body?.keyword, { maxLen: 80 });
  const familyFriendly = parseBool(body?.familyFriendly, false);

  const placesFilters = parsePlacesFilters(body?.placesFilters);
  const eventFilters = parseEventFilters(body?.eventFilters);

  return {
    ok: true,
    value: {
      lat,
      lng,
      radiusMeters,

      // expanded prefs
      mode,
      placeCategory: placeCategory && placeCategory !== "any" ? placeCategory : null,
      eventCategory: eventCategory && eventCategory !== "any" ? eventCategory : null,
      when,
      who,
      vibes,
      keyword,
      familyFriendly,

      placesFilters,
      eventFilters,

      // back-compat fields
      activityType: activityType || null,
      quickFilter: quickFilter || null,
      budget,
      isCustom,
      diningMode,
    },
  };
}

module.exports = {
  parseCursor,
  parsePerPage,
  validateNewSearchBody,
};
