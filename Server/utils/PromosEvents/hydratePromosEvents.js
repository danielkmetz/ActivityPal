const Business = require("../../models/Business");
const Event = require("../../models/Events");
const Promotion = require("../../models/Promotions");
const { isPromoLaterToday, isPromoActive, isEventLaterToday, isEventActive } = require("../enrichBusinesses");

/**
 * Build a placeId -> { businessName?, events[], promotions[], promoRank } map.
 * Only includes promos/events that are ACTIVE now or UPCOMING later today.
 */
async function buildPromoEventMap({
  placeIds,
  includeBusinesses = false,
  businessSelect = "placeId businessName",
  now = new Date(),
} = {}) {
  const ids = Array.isArray(placeIds) ? placeIds.map(String).filter(Boolean) : [];

  const map = Object.create(null);
  for (const pid of ids) {
    map[pid] = {
      placeId: pid,
      businessName: null,
      events: [],
      promotions: [],
      promoRank: 0,
      _activeCount: 0,
      _upcomingCount: 0,
    };
  }
  if (!ids.length) return map;

  // NOTE: this is server local time. If your server is UTC, "today" might not be Chicago-today.
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const [businesses, events, promotions] = await Promise.all([
    includeBusinesses
      ? Business.find({ placeId: { $in: ids } }).select(businessSelect).lean()
      : Promise.resolve([]),
    Event.find({ placeId: { $in: ids } }).lean(),
    Promotion.find({ placeId: { $in: ids } }).lean(),
  ]);

  if (includeBusinesses) {
    for (const biz of businesses) {
      const key = String(biz?.placeId);
      if (map[key]) map[key] = { ...map[key], ...biz };
    }
  }

  // Attach only ACTIVE / UPCOMING-TODAY events
  for (const event of events) {
    const key = String(event?.placeId);
    if (!map[key]) continue;

    let kind = null;
    if (isEventActive(event, nowMinutes, now)) kind = "activeEvent";
    else if (isEventLaterToday(event, nowMinutes, now)) kind = "upcomingEvent";

    if (!kind) continue;

    map[key].events.push({ ...event, kind });
    if (kind === "activeEvent") map[key]._activeCount += 1;
    else map[key]._upcomingCount += 1;
  }

  // Attach only ACTIVE / UPCOMING-TODAY promos
  for (const promo of promotions) {
    const key = String(promo?.placeId);
    if (!map[key]) continue;

    let kind = null;
    if (isPromoActive(promo, nowMinutes, now)) kind = "activePromo";
    else if (isPromoLaterToday(promo, nowMinutes, now)) kind = "upcomingPromo";

    if (!kind) continue;

    map[key].promotions.push({ ...promo, kind });
    if (kind === "activePromo") map[key]._activeCount += 1;
    else map[key]._upcomingCount += 1;
  }

  for (const pid of Object.keys(map)) {
    const active = map[pid]._activeCount > 0;
    const upcoming = map[pid]._upcomingCount > 0;
    map[pid].promoRank = active ? 2 : upcoming ? 1 : 0;
  }

  return map;
}

/**
 * Hydrate an array of Google places-like objects (place_id) with
 * { events, promotions, promoRank } using DB promos/events.
 */
async function hydratePlacesWithPromosEvents({ places, now = new Date() } = {}) {
  const list = Array.isArray(places) ? places : [];
  const placeIds = list.map((p) => p?.place_id).filter(Boolean).map(String);

  const map = await buildPromoEventMap({ placeIds, includeBusinesses: false, now });

  const hydrated = list.map((p) => {
    const key = String(p?.place_id || "");
    const bucket = map[key];

    return bucket
      ? { ...p, events: bucket.events, promotions: bucket.promotions, promoRank: bucket.promoRank }
      : { ...p, events: [], promotions: [], promoRank: 0 };
  });

  return { hydrated, map };
}

/**
 * Sort helper: promoRank desc, then active count desc, upcoming count desc, then distance asc.
 */
function sortPlacesByPromoThenDistance(places = []) {
  const list = Array.isArray(places) ? places : [];
  return list.sort((a, b) => {
    const r = (b?.promoRank || 0) - (a?.promoRank || 0);
    if (r !== 0) return r;

    const bActive =
      (b?.events || []).filter((x) => x?.kind === "activeEvent").length +
      (b?.promotions || []).filter((x) => x?.kind === "activePromo").length;
    const aActive =
      (a?.events || []).filter((x) => x?.kind === "activeEvent").length +
      (a?.promotions || []).filter((x) => x?.kind === "activePromo").length;
    if (bActive !== aActive) return bActive - aActive;

    const bUpcoming =
      (b?.events || []).filter((x) => x?.kind === "upcomingEvent").length +
      (b?.promotions || []).filter((x) => x?.kind === "upcomingPromo").length;
    const aUpcoming =
      (a?.events || []).filter((x) => x?.kind === "upcomingEvent").length +
      (a?.promotions || []).filter((x) => x?.kind === "upcomingPromo").length;
    if (bUpcoming !== aUpcoming) return bUpcoming - aUpcoming;

    const aDist = typeof a?.distance === "number" ? a.distance : Infinity;
    const bDist = typeof b?.distance === "number" ? b.distance : Infinity;
    return aDist - bDist;
  });
}

module.exports = {
  buildPromoEventMap,
  hydratePlacesWithPromosEvents,
  sortPlacesByPromoThenDistance,
};
