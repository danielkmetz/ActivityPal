import sortActivities from "../sortActivities";

/**
 * Normalize a date string to YYYY-MM-DD in local time.
 * Avoids UTC drift from toISOString() for "today".
 */
function localYMD(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayName(d = new Date()) {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

/**
 * Best-effort open-now resolution across possible shapes.
 * Your data layer should normalize this, but this keeps UI safe.
 */
function getOpenNow(item) {
  if (item?.openNow === true) return true;
  if (item?.open_now === true) return true;
  if (item?.opening_hours?.open_now === true) return true;
  if (item?.opening_hours?.openNow === true) return true;
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

function filterBusinessEventsForToday(events, todayStr, weekday) {
  const list = Array.isArray(events) ? events : [];
  return list.filter((event) => {
    const isOneTimeToday = event?.date === todayStr;
    const isRecurringToday = Array.isArray(event?.recurringDays)
      ? event.recurringDays.includes(weekday)
      : false;
    return isOneTimeToday || isRecurringToday;
  });
}

function filterBusinessPromosForToday(promotions, weekday) {
  const list = Array.isArray(promotions) ? promotions : [];
  return list.filter((promo) =>
    Array.isArray(promo?.recurringDays) ? promo.recurringDays.includes(weekday) : false
  );
}

/**
 * Merge a single activity with optional business.
 * Ensures we always return stable fields used by rendering/filters.
 */
function mergeOne({ activity, business }) {
  if (business) {
    return {
      ...activity,
      // keep an explicit normalized openNow for filtering/sorting
      openNow: getOpenNow(activity),
      business: {
        ...business,
        logoFallback: activity?.photoUrl || null,
      },
    };
  }

  // fallback business shape if none exists in DB
  return {
    ...activity,
    openNow: getOpenNow(activity),
    events: [],
    promotions: [],
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
 * Main function: given activities + businessData + filters, return list ready for UI.
 *
 * @param {Object} args
 * @param {Array} args.activities - google places-like results
 * @param {Array} args.businessData - DB business objects (events/promotions)
 * @param {Array} args.categoryFilter - cuisines selected
 * @param {boolean} args.openNowOnly - filter to open now
 * @param {string|null} args.sortOption - your sort key
 */
export default function buildDisplayList({
  activities,
  businessData,
  categoryFilter,
  openNowOnly,
  sortOption,
}) {
  const safeActivities = Array.isArray(activities) ? activities : [];
  if (!safeActivities.length) return [];

  const businessByPlaceId = buildBusinessByPlaceId(businessData);

  const todayStr = localYMD(new Date());
  const weekday = weekdayName(new Date());

  // merge + compute today’s promos/events
  const merged = safeActivities.map((activity) => {
    const placeId = activity?.place_id;
    const business = placeId ? businessByPlaceId.get(placeId) : null;

    // ✅ preserve backend-enriched arrays if they exist
    const events = Array.isArray(activity?.events)
      ? activity.events
      : Array.isArray(business?.events)
        ? business.events
        : [];

    const promotions = Array.isArray(activity?.promotions)
      ? activity.promotions
      : Array.isArray(business?.promotions)
        ? business.promotions
        : [];

    return mergeOne({
      activity: { ...activity, events, promotions },
      business,
    });
  });

  // highlighted first, then regular sorted by distance
  const highlighted = [];
  const regular = [];

  for (const item of merged) {
    const hasHighlight = (item?.events?.length || 0) > 0 || (item?.promotions?.length || 0) > 0;
    (hasHighlight ? highlighted : regular).push(item);
  }

  const combined = [...highlighted, ...regular]; // ✅ preserves backend order within each bucket

  // category filter (cuisine match)
  const hasCategoryFilter = Array.isArray(categoryFilter) && categoryFilter.length > 0;
  const categoryFiltered = hasCategoryFilter
    ? combined.filter((item) => {
      const cuisine = toLower(item?.cuisine);
      if (!cuisine) return false;
      return categoryFilter.some((f) => cuisine === toLower(f));
    })
    : combined;

  // open-now filter (uses normalized openNow from mergeOne)
  const openFiltered = openNowOnly
    ? categoryFiltered.filter((item) => item?.openNow === true)
    : categoryFiltered;

  // sort option (optional)
  const sorted = sortOption ? sortActivities(openFiltered, sortOption) : openFiltered;

  return sorted;
}
