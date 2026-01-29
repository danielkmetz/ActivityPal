import sortActivities from "../sortActivities";

/**
 * Best-effort open-now resolution across possible shapes.
 */
function getOpenNow(item) {
  if (item?.openNow === true) return true;
  if (item?.open_now === true) return true;
  if (item?.opening_hours?.open_now === true) return true;
  if (item?.opening_hours?.openNow === true) return true;

  // Places v1 shapes (you already include currentOpeningHours)
  if (item?.currentOpeningHours?.openNow === true) return true;

  return false;
}

function toLower(x) {
  return String(x || "").trim().toLowerCase();
}

function buildBusinessByPlaceId(businessData) {
  const map = new Map();
  const list = Array.isArray(businessData) ? businessData : [];
  for (const b of list) {
    const id = b?.placeId || b?.place_id;
    if (id) map.set(id, b);
  }
  return map;
}

/**
 * Merge arrays with de-dupe by _id/id when present.
 * Keeps stable order: earlier sources win ordering.
 */
function mergeArraysDedup(...candidates) {
  const out = [];
  const seen = new Set();

  for (const arr of candidates) {
    if (!Array.isArray(arr) || arr.length === 0) continue;

    for (const item of arr) {
      const key = item?._id || item?.id || null;
      if (key) {
        const k = String(key);
        if (seen.has(k)) continue;
        seen.add(k);
      }
      out.push(item);
    }
  }

  return out;
}

/**
 * Places v1 regularOpeningHours periods parsing:
 * period.open / period.close are usually { day, hour, minute }
 * where day can be number (0-6) or string (MONDAY..)
 */
const DOW = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function toDowIndex(day) {
  if (typeof day === "number" && day >= 0 && day <= 6) return day;
  const s = String(day || "").trim().toUpperCase();
  if (s in DOW) return DOW[s];
  // sometimes APIs use 1-7; if you ever see that:
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0 && n <= 6) return n;
  if (Number.isFinite(n) && n >= 1 && n <= 7) return n % 7; // 7->0
  return null;
}

function minutesSinceWeekStart(date) {
  const dow = date.getDay(); // 0 Sun .. 6 Sat
  return dow * 1440 + date.getHours() * 60 + date.getMinutes();
}

function periodToRange(period) {
  const open = period?.open || null;
  const close = period?.close || null;

  const oDay = toDowIndex(open?.day);
  const oHour = Number(open?.hour);
  const oMin = Number(open?.minute ?? 0);

  if (oDay == null || !Number.isFinite(oHour) || !Number.isFinite(oMin)) return null;

  const start = oDay * 1440 + oHour * 60 + oMin;

  // If no close, treat as open until end of the day (best-effort)
  if (!close) return { start, end: start + 24 * 60 };

  const cDay = toDowIndex(close?.day);
  const cHour = Number(close?.hour);
  const cMin = Number(close?.minute ?? 0);

  if (cDay == null || !Number.isFinite(cHour) || !Number.isFinite(cMin)) {
    return { start, end: start + 24 * 60 };
  }

  let end = cDay * 1440 + cHour * 60 + cMin;

  // Overnight wrap
  if (end <= start) end += 7 * 1440;

  return { start, end };
}

/**
 * Returns:
 * - true/false when determinable
 * - null when we don't have enough info
 */
function isOpenAtISO(activity, whenAtISO) {
  if (!whenAtISO) return null;
  const t = new Date(whenAtISO);
  if (Number.isNaN(t.getTime())) return null;

  const oh =
    activity?.openingHours ||
    activity?.regularOpeningHours ||
    activity?.regular_opening_hours ||
    null;

  const periods = Array.isArray(oh?.periods) ? oh.periods : null;
  if (!periods || periods.length === 0) return null;

  let target = minutesSinceWeekStart(t);

  for (const p of periods) {
    const r = periodToRange(p);
    if (!r) continue;

    const { start, end } = r;
    const target2 = target + 7 * 1440;

    if ((target >= start && target < end) || (target2 >= start && target2 < end)) {
      return true;
    }
  }

  return false;
}

/**
 * Merge a single activity with optional business.
 * Ensures we always return stable fields used by rendering/filters.
 */
function mergeOne({ activity, business, whenAtISO, openNowOnly }) {
  const effectiveISO = whenAtISO || (openNowOnly ? new Date().toISOString() : null);
  const openAtTarget = effectiveISO ? isOpenAtISO(activity, effectiveISO) : null;

  const openResolved = openAtTarget === null ? getOpenNow(activity) : openAtTarget;

  if (business) {
    return {
      ...activity,
      openNow: openResolved,
      _openNowSource: openAtTarget === null ? "api" : "periods",
      business: {
        ...business,
        logoFallback: activity?.photoUrl || null,
      },
    };
  }

  return {
    ...activity,
    openNow: openResolved,
    _openNowSource: openAtTarget === null ? "api" : "periods",
    events: Array.isArray(activity?.events) ? activity.events : [],
    promotions: Array.isArray(activity?.promotions) ? activity.promotions : [],
    business: {
      placeId: activity?.place_id || null,
      businessName: activity?.name || "",
      location: activity?.address || activity?.formatted_address || "",
      logoFallback: activity?.photoUrl || null,
      phone: "",
      description: "",
      events: [],
      promotions: [],
    },
  };
}

/**
 * Main function
 */
export default function buildDisplayList({
  activities,
  businessData,
  categoryFilter,
  openNowOnly,
  sortOption,

  // ✅ NEW
  whenAtISO = null,
}) {
  const safeActivities = Array.isArray(activities) ? activities : [];
  if (!safeActivities.length) return [];

  const businessByPlaceId = buildBusinessByPlaceId(businessData);

  const merged = safeActivities.map((activity) => {
    const placeId = activity?.place_id;
    const business = placeId ? businessByPlaceId.get(placeId) : null;

    const resolvedEvents = mergeArraysDedup(
      activity?.events,
      activity?.activeEvents,
      activity?.upcomingEvents,
      business?.events
    );

    const resolvedPromotions = mergeArraysDedup(
      activity?.promotions,
      activity?.activePromos,
      activity?.upcomingPromos,
      business?.promotions
    );

    return mergeOne({
      activity: { ...activity, events: resolvedEvents, promotions: resolvedPromotions },
      business,
      whenAtISO,
      openNowOnly,
    });
  });

  const highlighted = [];
  const regular = [];

  for (const item of merged) {
    const hasHighlight =
      (Array.isArray(item?.events) ? item.events.length : 0) > 0 ||
      (Array.isArray(item?.promotions) ? item.promotions.length : 0) > 0;

    (hasHighlight ? highlighted : regular).push(item);
  }

  const combined = [...highlighted, ...regular];

  const hasCategoryFilter = Array.isArray(categoryFilter) && categoryFilter.length > 0;
  const categoryFiltered = hasCategoryFilter
    ? combined.filter((item) => {
      const cuisine = toLower(item?.cuisine);
      if (!cuisine) return false;
      return categoryFilter.some((f) => cuisine === toLower(f));
    })
    : combined;

  const openFiltered = openNowOnly
    ? categoryFiltered.filter((item) => item?.openNow === true)
    : categoryFiltered;

  const sorted = sortOption ? sortActivities(openFiltered, sortOption) : openFiltered;

  return sorted;
}
