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

/**
 * Prefer the first NON-EMPTY array from candidates.
 * Critical: an empty [] should NOT block fallback to business data.
 */
function pickNonEmptyArray(...candidates) {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return [];
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
        if (seen.has(String(key))) continue;
        seen.add(String(key));
      }
      out.push(item);
    }
  }

  return out;
}

/**
 * Optional "today" filter helpers (left here because you had them),
 * but this file does NOT force "today only" unless you explicitly use them.
 */
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
  const openNow = getOpenNow(activity);

  if (business) {
    return {
      ...activity,
      openNow,
      business: {
        ...business,
        logoFallback: activity?.photoUrl || null,
      },
    };
  }

  // fallback business shape if none exists in DB
  return {
    ...activity,
    openNow,
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
 * Main function: given activities + businessData + filters, return list ready for UI.
 *
 * NOTE: This is refactored for your new architecture where the FIRST call can
 * already include promos/events. The key fix is: an empty [] from the activity
 * must NOT block fallback to business data.
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

  // computed but not forced into filtering unless you choose to use the helpers
  const todayStr = localYMD(new Date());
  const weekday = weekdayName(new Date());

  const merged = safeActivities.map((activity) => {
    const placeId = activity?.place_id;
    const business = placeId ? businessByPlaceId.get(placeId) : null;

    // --- EVENTS/PROMOS RESOLUTION ---
    // Prefer backend-enriched arrays if they have items.
    // Fall back to business DB arrays if the activity arrays are missing OR EMPTY.
    //
    // Also support your newer hydrate shape (active/upcoming) if present.
    const resolvedEvents = pickNonEmptyArray(
      activity?.events,
      activity?.activeEvents,
      activity?.upcomingEvents,
      business?.events
    );

    const resolvedPromotions = pickNonEmptyArray(
      activity?.promotions,
      activity?.activePromos,
      activity?.upcomingPromos,
      business?.promotions
    );

    // If you ever want to MERGE instead of pick:
    // const resolvedEvents = mergeArraysDedup(activity?.events, activity?.activeEvents, activity?.upcomingEvents, business?.events);
    // const resolvedPromotions = mergeArraysDedup(activity?.promotions, activity?.activePromos, activity?.upcomingPromos, business?.promotions);

    // Keep today helpers available (unused by default)
    // const todaysEvents = filterBusinessEventsForToday(resolvedEvents, todayStr, weekday);
    // const todaysPromos = filterBusinessPromosForToday(resolvedPromotions, weekday);

    return mergeOne({
      activity: { ...activity, events: resolvedEvents, promotions: resolvedPromotions },
      business,
    });
  });

  // highlighted first, then regular (keeps current order within each bucket)
  const highlighted = [];
  const regular = [];

  for (const item of merged) {
    const hasHighlight =
      (Array.isArray(item?.events) ? item.events.length : 0) > 0 ||
      (Array.isArray(item?.promotions) ? item.promotions.length : 0) > 0;

    (hasHighlight ? highlighted : regular).push(item);
  }

  const combined = [...highlighted, ...regular];

  // category filter (cuisine match)
  const hasCategoryFilter = Array.isArray(categoryFilter) && categoryFilter.length > 0;
  const categoryFiltered = hasCategoryFilter
    ? combined.filter((item) => {
        const cuisine = toLower(item?.cuisine);
        if (!cuisine) return false;
        return categoryFilter.some((f) => cuisine === toLower(f));
      })
    : combined;

  // open-now filter (uses normalized openNow)
  const openFiltered = openNowOnly
    ? categoryFiltered.filter((item) => item?.openNow === true)
    : categoryFiltered;

  // sort option (optional)
  const sorted = sortOption ? sortActivities(openFiltered, sortOption) : openFiltered;

  return sorted;
}
