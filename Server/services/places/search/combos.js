// search/combos.js

const {
  QUICK_FILTER_COMBOS,
  PLACE_CATEGORY_COMBOS,

  // legacy fallbacks (keep until all callers migrated)
  quickFilters,
  activityTypeKeywords,
} = require("./filterConfig");

const MAX_COMBOS = 10;

// These are broad + generally safe for Places v1 searchNearby includedTypes.
// Keep the list small to avoid wasting calls.
const V1_FALLBACK_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "park",
  "tourist_attraction",
  "museum",
  "movie_theater",
  "bowling_alley",
];

function parseDiningMode(v) {
  const s = String(v || "").toLowerCase().trim();
  return s === "quick_bite" || s === "quickbite" || s === "quick" ? "quick_bite" : "sit_down";
}

/**
 * rankby=distance should be used only for flows where "closest" matters most.
 */
function shouldRankByDistance({ activityType, quickFilter } = {}) {
  if (activityType === "Dining") return true;
  if (quickFilter === "whatsClose") return true;
  return false;
}

function normalizeCombo(c) {
  const type = String(c?.type || "").trim();
  const keyword = c?.keyword == null ? null : String(c.keyword).trim();
  if (!type) return null;
  return keyword ? { type, keyword } : { type };
}

function dedupeAndCap(combos, cap = MAX_COMBOS) {
  const out = [];
  const seen = new Set();

  for (const c of combos) {
    const n = normalizeCombo(c);
    if (!n) continue;

    const key = `${n.type}|${n.keyword || ""}`;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(n);

    if (out.length >= cap) break;
  }

  return out;
}

function vibeToKeyword(v) {
  const s = String(v || "").toLowerCase().trim();
  const map = {
    cozy: "cozy",
    lively: "lively",
    romantic: "romantic",
    chill: "chill",
    active: "active",
  };
  return map[s] || null;
}

function buildV1FallbackCombos({ avoidBars }) {
  const types = avoidBars
    ? V1_FALLBACK_TYPES.filter((t) => t !== "bar")
    : V1_FALLBACK_TYPES;

  return types.map((type) => ({ type }));
}

function normalizePlaceCategory(pc) {
  const s = String(pc || "").trim().toLowerCase();

  const aliases = {
    outdoors: "outdoor",
    outdoor: "outdoor",
    "outdoor_recreation": "outdoor",

    "food-drink": "food_drink",
    fooddrink: "food_drink",
  };

  return aliases[s] || s;
}

// --- NEW: extract keywords from config combos (for v1 text fallback) ---
function extractKeywordsFromConfigCombos(list) {
  const out = [];
  const arr = Array.isArray(list) ? list : [];
  for (const c of arr) {
    const kw = String(c?.keyword || "").trim();
    if (kw) out.push(kw);
  }
  return out;
}

function compactTextQueryFromKeywords(keywords, limit = 3) {
  const ks = Array.isArray(keywords) ? keywords : [];
  const seen = new Set();
  const kept = [];

  for (const raw of ks) {
    const k = String(raw || "").trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(k);
    if (kept.length >= limit) break;
  }

  return kept.length ? kept.join(" ") : null;
}

// --- NEW: group includedTypes into a few nearby streams (2–4 calls, not 8–10) ---
function groupTypes(types, { groupSize = 3, maxGroups = 4 } = {}) {
  const t = Array.isArray(types) ? types.filter(Boolean) : [];
  const out = [];
  let i = 0;

  while (i < t.length && out.length < maxGroups) {
    out.push(t.slice(i, i + groupSize));
    i += groupSize;
  }

  return out;
}

/**
 * Single source of truth for combo building.
 *
 * provider:
 *  - "legacy"   => allows {type:"establishment", keyword:"..."} patterns
 *  - "v1Nearby" => NO "establishment" (invalid), keyword ignored by searchNearby
 */
function buildSearchCombos({
  provider = "legacy", // "legacy" | "v1Nearby"

  isCustom,
  source,
  activityType,
  quickFilter,
  placeCategory,
  diningMode,
  keyword,
  vibes,
  placesFilters,
} = {}) {
  const combos = [];
  const isV1Nearby = provider === "v1Nearby";

  const avoidBars =
    !!placesFilters?.avoid?.bars ||
    !!placesFilters?.avoidBars;

  const mode = activityType === "Dining" ? parseDiningMode(diningMode) : null;

  const pcRaw = String(placeCategory || "").trim();
  const pcNorm = normalizePlaceCategory(pcRaw);

  // Helper: only push "establishment keyword" combos if the provider supports it.
  const pushKeywordCombo = (kw) => {
    const k = String(kw || "").trim();
    if (!k) return;
    if (isV1Nearby) return; // keyword ignored / establishment invalid
    combos.push({ type: "establishment", keyword: k });
  };

  // ---------------------------
  // 1) QUICK FILTER (new)
  // ---------------------------
  if (quickFilter) {
    const q = String(quickFilter).trim();
    const fromNew = Array.isArray(QUICK_FILTER_COMBOS?.[q]) ? QUICK_FILTER_COMBOS[q] : null;

    if (fromNew) {
      combos.push(...fromNew);
    } else {
      const legacy = Array.isArray(quickFilters?.[q]) ? quickFilters[q] : [];
      for (const k of legacy) pushKeywordCombo(k);
    }
  }

  // ---------------------------
  // 2) PLACE CATEGORY (new)
  // ---------------------------
  if (!quickFilter) {
    if (pcNorm && pcNorm !== "any") {
      const fromNew = Array.isArray(PLACE_CATEGORY_COMBOS?.[pcNorm]) ? PLACE_CATEGORY_COMBOS[pcNorm] : null;
      if (fromNew) combos.push(...fromNew);
    }
  }

  // ---------------------------
  // 3) DINING (special-case)
  // ---------------------------
  if (!quickFilter && combos.length === 0 && activityType === "Dining") {
    if (mode === "quick_bite") {
      combos.push({ type: "cafe" }, { type: "bakery" }, { type: "meal_takeaway" });
    } else {
      combos.push({ type: "restaurant" }, { type: "bar" }, { type: "cafe" });
    }
  }

  // ---------------------------
  // 4) CUSTOM (legacy fallback)
  // ---------------------------
  if ((isCustom || source === "custom") && combos.length === 0) {
    const legacy = Array.isArray(activityTypeKeywords?.[activityType])
      ? activityTypeKeywords[activityType]
      : [];
    for (const k of legacy) pushKeywordCombo(k);
  }

  // ---------------------------
  // 5) Keyword/Vibes (new)
  // ---------------------------
  const kw = String(keyword || "").trim();
  if (kw && !isV1Nearby) {
    combos.unshift({ type: "establishment", keyword: kw });
  }

  const vibeList = Array.isArray(vibes) ? vibes : [];
  for (const v of vibeList) {
    const vk = vibeToKeyword(v);
    if (vk) pushKeywordCombo(vk);
  }

  // ---------------------------
  // 6) Preference-driven tweaks
  // ---------------------------
  let finalCombos = combos;

  if (avoidBars) {
    finalCombos = finalCombos.filter((c) => String(c?.type || "") !== "bar");
  }

  // ---------------------------
  // 7) HARD FALLBACK
  // ---------------------------
  const hasAnyValidType = finalCombos.some((c) => {
    const t = String(c?.type || "").trim();
    if (!t) return false;
    if (isV1Nearby && t === "establishment") return false;
    return true;
  });

  if (!hasAnyValidType) {
    finalCombos = isV1Nearby
      ? buildV1FallbackCombos({ avoidBars })
      : [{ type: "establishment" }];
  } else if (isV1Nearby) {
    // Strip invalid legacy type if any slipped in
    finalCombos = finalCombos.filter((c) => String(c?.type || "") !== "establishment");

    if (finalCombos.length === 0) {
      finalCombos = buildV1FallbackCombos({ avoidBars });
    }
  }

  return dedupeAndCap(finalCombos, MAX_COMBOS);
}

/**
 * NEW: v1Nearby plan builder.
 * Produces:
 *  - nearbyTypeGroups: grouped includedTypes arrays for 2–4 nearby calls
 *  - textFallbackQuery: a compact text query built from keyword-y config, to run only as fallback
 *
 * IMPORTANT:
 * - This does NOT create actual engine streams. It just returns “what to run.”
 */
function buildV1NearbyPlan({
  activityType,
  quickFilter,
  placeCategory,
  diningMode,
  placesFilters,
} = {}) {
  const avoidBars =
    !!placesFilters?.avoid?.bars ||
    !!placesFilters?.avoidBars;

  const mode = activityType === "Dining" ? parseDiningMode(diningMode) : null;

  const pcNorm = normalizePlaceCategory(placeCategory);

  let typedCombos = [];
  let keywordHints = [];

  // Prefer quickFilter combos if present
  if (quickFilter) {
    const q = String(quickFilter).trim();
    const fromNew = Array.isArray(QUICK_FILTER_COMBOS?.[q]) ? QUICK_FILTER_COMBOS[q] : null;

    if (fromNew) {
      typedCombos = fromNew.filter((c) => c && c.type && String(c.type) !== "establishment");
      keywordHints = extractKeywordsFromConfigCombos(fromNew);
    } else {
      // legacy quickFilters is string array; treat as keyword hints for text fallback
      const legacy = Array.isArray(quickFilters?.[q]) ? quickFilters[q] : [];
      keywordHints = legacy.map((x) => String(x || "").trim()).filter(Boolean);
      typedCombos = []; // none
    }
  } else if (pcNorm && pcNorm !== "any") {
    const fromNew = Array.isArray(PLACE_CATEGORY_COMBOS?.[pcNorm]) ? PLACE_CATEGORY_COMBOS[pcNorm] : null;
    if (fromNew) {
      typedCombos = fromNew.filter((c) => c && c.type && String(c.type) !== "establishment");
      keywordHints = extractKeywordsFromConfigCombos(fromNew);
    }
  }

  // Dining special-case if nothing typed yet
  if (!typedCombos.length && activityType === "Dining") {
    if (mode === "quick_bite") {
      typedCombos = [{ type: "cafe" }, { type: "bakery" }, { type: "meal_takeaway" }];
    } else {
      typedCombos = [{ type: "restaurant" }, { type: "bar" }, { type: "cafe" }];
    }
  }

  // Apply avoidBars to typed
  if (avoidBars) {
    typedCombos = typedCombos.filter((c) => String(c?.type || "") !== "bar");
  }

  // Extract unique types in order
  const seen = new Set();
  const types = [];
  for (const c of typedCombos) {
    const t = String(c?.type || "").trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    types.push(t);
  }

  // Hard fallback types if still empty
  const finalTypes = types.length
    ? types
    : (avoidBars ? V1_FALLBACK_TYPES.filter((t) => t !== "bar") : V1_FALLBACK_TYPES);

  // Group into a few nearby calls
  const nearbyTypeGroups = groupTypes(finalTypes, { groupSize: 3, maxGroups: 4 });

  // Compact text fallback query from keyword-ish config hints
  const textFallbackQuery = compactTextQueryFromKeywords(keywordHints, 3);

  return { nearbyTypeGroups, textFallbackQuery };
}

module.exports = {
  parseDiningMode,
  shouldRankByDistance,
  buildSearchCombos,
  buildV1NearbyPlan,
};
