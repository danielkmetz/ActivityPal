const { classifyRestaurantCuisine } = require("../../../RestaurantClass/Keywords/Keywords");
const { getCuisineFromLanguage } = require("../../../RestaurantClass/Language");
const { classifyCuisineFromReviews } = require("../../../RestaurantClass/ByReview");

async function enrichCuisineWithCache(p) {
  try {
    const name = p?.name || "";
    const keywordCuisine = classifyRestaurantCuisine(name);
    const reviewCuisine = keywordCuisine === "unknown"
      ? await classifyCuisineFromReviews(p.place_id)
      : null;

    const languageCuisine =
      keywordCuisine === "unknown" && (reviewCuisine == null || reviewCuisine === "unknown")
        ? await getCuisineFromLanguage(name)
        : null;

    let cuisine = keywordCuisine || languageCuisine || reviewCuisine || "unknown";
    if (cuisine === "unknown" && (p.types || []).includes("bar")) cuisine = "bar_food";
    return { ...p, cuisine };
  } catch {
    return p;
  }
}

module.exports = { enrichCuisineWithCache };
