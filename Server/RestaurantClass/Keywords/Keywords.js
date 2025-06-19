const cuisineKeywords = require('./keywordBank');

const classifyRestaurantCuisine = (name = "") => {
  const normalized = name.toLowerCase();
  const scores = {};

  for (const [category, keywords] of Object.entries(cuisineKeywords)) {
    scores[category] = keywords.reduce((score, keyword) => {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      return score + (pattern.test(normalized) ? 1 : 0);
    }, 0);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topCategory, topScore] = sorted[0];
  return topScore > 0 ? topCategory : "unknown";
};

const classifyMultiCuisine = (name = "") => {
  const normalized = name.toLowerCase();
  return Object.entries(cuisineKeywords)
    .filter(([_, keywords]) =>
      keywords.some(keyword => normalized.includes(keyword))
    )
    .map(([category]) => category);
};

const scoreCuisineCategories = (text = "") => {
  const normalized = text.toLowerCase();
  const scores = {};

  for (const [category, keywords] of Object.entries(cuisineKeywords)) {
    scores[category] = keywords.reduce(
      (score, keyword) => {
        const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
        return score + (pattern.test(normalized) ? 1 : 0);
      },
      0
    );
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, score]) => score > 0); // Only return categories with at least 1 match
};

module.exports = {
  classifyRestaurantCuisine,
  classifyMultiCuisine,
  scoreCuisineCategories,
};
