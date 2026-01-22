// utils/isFastFood.js

// Keep this as the single source of truth.
// Add aliases only when you’ve seen real misses in logs.
const FAST_FOOD_CHAINS = [
  "McDonald's",
  "Burger King",
  "Wendy's",
  "Taco Bell",
  "KFC",
  "Popeyes",
  "Arby's",
  "Subway",
  "Sonic",
  "Jack in the Box",
  "Hardee's",
  "Carl's Jr",
  "Chick-fil-A",
  "Five Guys",
  "Checkers",
  "White Castle",
  "Del Taco",
  "Jimmy John's",
  "Raising Cane's",
  "In-N-Out",
  "Little Caesars",
  "Domino's",
  "Pizza Hut",
  "Dairy Queen",
  "QDOBA",
  "Jersey Mike's",
  "Wingstop",
  "Dunkin'",
  "Panera",
  "Potbelly",
  "Starbucks",
  "Panda Express",
  "Donuts",
];

// Optional: targeted aliases for real-world variants.
// Don’t go crazy here—aliases can create false positives.
const FAST_FOOD_ALIASES = {
  "McDonald's": ["mcdonalds", "mc donalds", "mcDonalds"],
  "KFC": ["kentucky fried chicken", "k f c"],
  "Chick-fil-A": ["chickfila", "chick fil a", "chick-fil-a"],
  "Carl's Jr": ["carls jr", "carl's junior", "carls junior"],
  "Jimmy John's": ["jimmy johns"],
  "Raising Cane's": ["raising canes", "raising cane's"],
  "In-N-Out": ["in n out", "in-n-out", "innout"],
  "Dairy Queen": ["dairy queen", "dq"], // "dq" can be noisy; remove if it causes false hits
};

function normalizeText(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFKD") // strip accent variants
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'") // normalize apostrophes
    .replace(/[^a-z0-9]+/g, " ") // punctuation -> spaces
    .replace(/\s+/g, " ")
    .trim();
}

// Builds a regex that matches a phrase as “words”, allowing flexible separators.
// Example: "chick fil a" matches "Chick-fil-A", "chick fil a", "chickfil-a", etc.
function phraseToRegex(phrase) {
  const norm = normalizeText(phrase);
  if (!norm) return null;

  const parts = norm.split(" ").filter(Boolean);
  if (!parts.length) return null;

  // For acronyms like "k f c" after normalization: parts ["k","f","c"]
  // Join with flexible separators.
  const body = parts.map(escapeRegExp).join("[\\s'\\-\\.]*");

  // Word boundaries: avoid matching inside larger words.
  return new RegExp(`\\b${body}\\b`, "i");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Precompile matchers once.
const FAST_FOOD_MATCHERS = (() => {
  const matchers = [];

  for (const chain of FAST_FOOD_CHAINS) {
    const base = phraseToRegex(chain);
    if (base) matchers.push({ chain, re: base });

    const aliases = FAST_FOOD_ALIASES[chain] || [];
    for (const a of aliases) {
      const re = phraseToRegex(a);
      if (re) matchers.push({ chain, re });
    }
  }

  return matchers;
})();

function isFastFood(placeName = "") {
  const norm = normalizeText(placeName);
  if (!norm) return false;

  // Use normalized string for consistent matching.
  for (const { re } of FAST_FOOD_MATCHERS) {
    if (re.test(norm)) return true;
  }
  return false;
}

// Optional: if you ever want to know WHICH chain matched for logging/debugging.
function matchFastFoodChain(placeName = "") {
  const norm = normalizeText(placeName);
  if (!norm) return null;

  for (const { chain, re } of FAST_FOOD_MATCHERS) {
    if (re.test(norm)) return chain;
  }
  return null;
}

module.exports = { isFastFood, matchFastFoodChain };
