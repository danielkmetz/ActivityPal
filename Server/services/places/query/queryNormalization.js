const { PRICE_LEVEL_TO_TIER } = require("../v1/config");

const MIN_PER_PAGE = 5;
const MAX_PER_PAGE = 25;

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function parsePerPage(v, fallback = 15) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_PER_PAGE, Math.max(MIN_PER_PAGE, Math.floor(n)));
}

function normalizeBudget(budget) {
  const b = typeof budget === "string" ? budget.trim() : null;
  if (!b || b.toLowerCase() === "any") return null;
  if (b === "$" || b === "$$" || b === "$$$" || b === "$$$$") return b;
  return null;
}

function normalizePriceTier(priceLevel) {
  if (typeof priceLevel === "string") return PRICE_LEVEL_TO_TIER[priceLevel] ?? null;
  if (typeof priceLevel === "number") return priceLevel;
  return null;
}

function normalizePlacesFilters(raw) {
  return raw && typeof raw === "object" ? raw : {};
}

function normalizeTimeCtx(q) {
  const timeZone = typeof q?.timeZone === "string" && q.timeZone.trim() ? q.timeZone.trim() : null;

  const raw = q?.tzOffsetMinutes;
  const n = raw === "" || raw == null ? null : Number(raw);
  const tzOffsetMinutes = Number.isFinite(n) && Math.abs(n) <= 14 * 60 ? Math.trunc(n) : null;

  return { timeZone, tzOffsetMinutes };
}

module.exports = {
  ensureArray,
  parsePerPage,
  normalizeBudget,
  normalizePriceTier,
  normalizePlacesFilters,
  normalizeTimeCtx,
};
