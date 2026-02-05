const crypto = require("crypto");

function stableStringify(value) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);

  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      const v = value[k];
      // keep undefined out entirely to reduce noise
      if (typeof v === "undefined") continue;
      out[k] = sortDeep(v);
    }
    return out;
  }

  return value;
}

function sha1Stable(obj) {
  return crypto.createHash("sha1").update(stableStringify(obj)).digest("hex");
}

function normStringOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normBoolOrNull(v) {
  return typeof v === "boolean" ? v : null;
}

function normNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normArrayOrNull(arr, { max = null } = {}) {
  if (!Array.isArray(arr)) return null;
  const out = arr.map((x) => (x == null ? null : String(x).trim())).filter(Boolean);
  if (!out.length) return null;
  return max ? out.slice(0, max) : out;
}

function normObjectOrNull(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function hashClientQuery(q) {
  const stable = {
    lat: normNumberOrNull(q.lat),
    lng: normNumberOrNull(q.lng),
    radiusMeters: normNumberOrNull(q.radiusMeters),
    activityType: normStringOrNull(q.activityType),
    quickFilter: normStringOrNull(q.quickFilter),
    placeCategory: normStringOrNull(q.placeCategory),
    budget: normStringOrNull(q.budget),
    includeUnpriced: normBoolOrNull(q.includeUnpriced),
    keyword: normStringOrNull(q.keyword),
    vibes: normArrayOrNull(q.vibes, { max: 2 }),
    placesFilters: normObjectOrNull(q.placesFilters),
    eventFilters: normObjectOrNull(q.eventFilters),
    familyFriendly: !!q.familyFriendly,
    who: normStringOrNull(q.who),
    whenAtISO: normStringOrNull(q.whenAtISO),
    timeZone: normStringOrNull(q.timeZone),
    tzOffsetMinutes: normNumberOrNull(q.tzOffsetMinutes),
    mode: normStringOrNull(q.mode),
    eventCategory: normStringOrNull(q.eventCategory),
  };

  return sha1Stable(stable);
}

function hashEngineStable(stableForHash) {
  return sha1Stable(stableForHash);
}

module.exports = { hashClientQuery, hashEngineStable };
