const seed = require("./fastFoodNames");
const { normalizeText } = require('../../../utils/normalization/normalizeText');

const FAST_FOOD_CHAINS = Array.isArray(seed)
  ? seed
  : Array.isArray(seed?.CHAINS)
    ? seed.CHAINS
    : [];

const FAST_FOOD_ALIASES =
  (seed && typeof seed === "object" && seed.ALIASES && typeof seed.ALIASES === "object")
    ? seed.ALIASES
    : {};

function extractName(input) {
  if (!input) return "";
  if (typeof input === "string") return input;

  // Support mapped objects or raw Google Places objects
  return String(
    input?.name ||
      input?.displayName?.text ||
      input?.displayName ||
      ""
  );
}

// ---- phrase matching (no regex needed because we normalize) ----
function includesWholePhrase(haystackNorm, phraseNorm) {
  if (!haystackNorm || !phraseNorm) return false;
  const hay = ` ${haystackNorm} `;
  const needle = ` ${phraseNorm} `;
  return hay.includes(needle);
}

// Precompute normalized phrases once.
const MATCH_PHRASES = (() => {
  const out = [];
  const seen = new Set(); // avoid duplicates

  function add(chain, phrase) {
    const p = normalizeText(phrase);
    if (!p) return;

    const key = `${chain}::${p}`;
    if (seen.has(key)) return;
    seen.add(key);

    out.push({ chain, phraseNorm: p });
  }

  for (const chain of FAST_FOOD_CHAINS) {
    add(chain, chain);

    const aliases = Array.isArray(FAST_FOOD_ALIASES?.[chain]) ? FAST_FOOD_ALIASES[chain] : [];
    for (const a of aliases) add(chain, a);
  }

  // Longest-first reduces accidental early matches if overlaps exist
  out.sort((a, b) => b.phraseNorm.length - a.phraseNorm.length);

  return out;
})();

function matchFastFoodChain(placeOrName = "") {
  const name = extractName(placeOrName);
  const norm = normalizeText(name);
  if (!norm) return null;

  for (const { chain, phraseNorm } of MATCH_PHRASES) {
    if (includesWholePhrase(norm, phraseNorm)) return chain;
  }
  return null;
}

function isFastFood(placeOrName = "") {
  return !!matchFastFoodChain(placeOrName);
}

module.exports = { isFastFood, matchFastFoodChain };
