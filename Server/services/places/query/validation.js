function parseCursor(raw) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parsePerPage(raw, opts = {}) {
  // Back-compat: allow { MIN_PER_PAGE, MAX_PER_PAGE } shape
  const min =
    Number.isFinite(opts.min) ? opts.min :
      Number.isFinite(opts.MIN_PER_PAGE) ? opts.MIN_PER_PAGE :
        5;

  const max =
    Number.isFinite(opts.max) ? opts.max :
      Number.isFinite(opts.MAX_PER_PAGE) ? opts.MAX_PER_PAGE :
        25;

  const fallback = Number.isFinite(opts.fallback) ? opts.fallback : 15;

  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
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
    const key = s.toLowerCase();
    if (out.some((x) => x.toLowerCase() === key)) continue;
    out.push(s);
    if (out.length >= 2) break; // hard cap
  }
  return out.length ? out : null;
}

// supports either: "today" | "weekend" | etc OR { kind: "date", date: "YYYY-MM-DD" }
function parseWhen(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
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
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;

  const avoid = v.avoid && typeof v.avoid === "object" && !Array.isArray(v.avoid) ? v.avoid : {};

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
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;

  const sort = parseEnum(v.sort, new Set(["date", "distance", "relevance"]), "date");

  const category = parseNullableString(v.category, { maxLen: 40 });

  return {
    category: category || null,
    freeOnly: parseBool(v.freeOnly, false),
    sort,
  };
}

function parseTimeZone(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, 64) : null;
}

function parseTzOffsetMinutes(v) {
  const n = v === "" || v == null ? null : Number(v);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 14 * 60) return null;
  return Math.trunc(n);
}

function parseWhenAtISO(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function validateNewSearchQuery(q) {
  const lat = Number(q?.lat);
  const lng = Number(q?.lng);

  // accept radiusMeters OR legacy radius
  const radiusMetersRaw =
    typeof q?.radiusMeters !== "undefined" ? q.radiusMeters : q?.radius;

  const radiusMeters = Number(radiusMetersRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, status: 400, error: "Invalid lat/lng" };
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 50000) {
    return {
      ok: false,
      status: 400,
      error: "Invalid radius (meters). Must be 0 < radius <= 50000",
    };
  }

  const mode = parseEnum(q?.mode, new Set(["places", "events", "mixed"]), "places");

  const placeCategory = parseEnum(
    q?.placeCategory,
    new Set(["any", "food_drink", "entertainment", "outdoor", "indoor", "family"]),
    null
  );

  const eventCategory = parseNullableString(q?.eventCategory, { maxLen: 40 });
  const activityType = parseNullableString(q?.activityType, { maxLen: 40 });
  const quickFilter = parseNullableString(q?.quickFilter, { maxLen: 40 });
  const budget = parseBudget(q?.budget);

  const includeUnpriced = typeof q?.includeUnpriced === "boolean"
    ? q.includeUnpriced
    : (q?.includeUnpriced === "true" ? true : (q?.includeUnpriced === "false" ? false : true));

  const isCustom = parseBool(q?.isCustom, false);

  const diningModeRaw = typeof q?.diningMode === "string" ? q.diningMode.trim() : "";
  const diningMode =
    diningModeRaw === "quick_bite" || diningModeRaw === "quickbite" || diningModeRaw === "quick"
      ? "quick_bite"
      : diningModeRaw
        ? "sit_down"
        : undefined;

  const when = parseWhen(q?.when);
  const whenAtISO = parseWhenAtISO(q?.whenAtISO);
  const who = parseNullableString(q?.who, { maxLen: 40 });
  const vibes = parseVibes(q?.vibes);
  const timeZone = parseTimeZone(q?.timeZone ?? q?.timezone);
  const tzOffsetMinutes = parseTzOffsetMinutes(q?.tzOffsetMinutes ?? q?.tzOffset);
  const keyword = parseNullableString(q?.keyword, { maxLen: 80 });
  const familyFriendly = parseBool(q?.familyFriendly, false);
  const placesFilters = parsePlacesFilters(q?.placesFilters);
  const eventFilters = parseEventFilters(q?.eventFilters);

  return {
    ok: true,
    value: {
      lat,
      lng,
      radiusMeters,
      mode,
      placeCategory: placeCategory && placeCategory !== "any" ? placeCategory : null,
      eventCategory: eventCategory && eventCategory !== "any" ? eventCategory : null,
      when,
      whenAtISO,
      timeZone,
      tzOffsetMinutes,
      who,
      vibes,
      keyword,
      familyFriendly,
      placesFilters,
      eventFilters,
      activityType: activityType || null,
      quickFilter: quickFilter || null,
      budget,
      includeUnpriced,
      isCustom,
      diningMode,
    },
  };
}

module.exports = {
  parseCursor,
  parsePerPage,
  validateNewSearchQuery,
};
