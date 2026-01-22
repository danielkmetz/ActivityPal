const { quickFilters, activityTypeKeywords } = require("./filterConfig");

function parseDiningMode(v) {
  const s = String(v || "").toLowerCase().trim();
  return s === "quick_bite" || s === "quickbite" || s === "quick" ? "quick_bite" : "sit_down";
}

function shouldRankByDistance(activityType) {
  return activityType === "Dining" || activityType === "whatsClose";
}

function buildSearchCombos({ isCustom, activityType, diningMode }) {
  if (isCustom) return activityTypeKeywords[activityType] || [];

  if (activityType === "Dining") {
    const mode = parseDiningMode(diningMode);
    if (mode === "quick_bite") {
      return [{ type: "cafe" }, { type: "bakery" }, { type: "meal_takeaway" }];
    }
    return [{ type: "restaurant" }, { type: "bar" }, { type: "cafe" }];
  }

  return (quickFilters[activityType] || []).map((k) => ({ type: "establishment", keyword: k }));
}

module.exports = { parseDiningMode, shouldRankByDistance, buildSearchCombos };
