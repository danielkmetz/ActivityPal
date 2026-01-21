// helpers/promoEventMap.js
const Business = require("../../models/Business");
const Event = require("../../models/Events");
const Promotion = require("../../models/Promotions");
const {
  isPromoLaterToday,
  isPromoActive,
  isEventLaterToday,
  isEventActive,
} = require("../enrichBusinesses");

// =====================
// LOGGING (always on)
// =====================
// Change this if you want to trace a different place. No env vars.
const TRACE_PLACE_ID = "ChIJC-gx3K4CD4gRdihO2jMKjRM";
const LOG_HYDRATE = true;

const log = (...args) => {
  if (!LOG_HYDRATE) return;
  console.log("[promoEventMap]", ...args);
};

const traceLog = (placeId, ...args) => {
  if (!LOG_HYDRATE) return;
  if (String(placeId) !== String(TRACE_PLACE_ID)) return;
  console.log("[promoEventMap][TRACE]", ...args);
};

function safeToISOString(d) {
  try {
    if (!d) return null;
    const dd = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dd.getTime()) ? null : dd.toISOString();
  } catch {
    return null;
  }
}

function summarizeDoc(x) {
  const obj = x?.toObject?.() ?? x;
  return {
    id: obj?._id ? String(obj._id) : null,
    title: obj?.title || null,
    placeId: obj?.placeId || null,
    dateISO: safeToISOString(obj?.date),
    allDay: obj?.allDay !== false,
    recurring: !!obj?.recurring,
    recurringDays: Array.isArray(obj?.recurringDays) ? obj.recurringDays : [],
    startTime: obj?.startTime ?? null,
    endTime: obj?.endTime ?? null,
  };
}

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

  log("buildPromoEventMap:start", {
    idsCount: ids.length,
    includeBusinesses,
    nowISO: safeToISOString(now),
    nowLocalString: now.toString(),
  });

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
  if (!ids.length) {
    log("buildPromoEventMap:empty ids");
    return map;
  }

  // NOTE: this is server local time. If your server is UTC, "today" might not be Chicago-today.
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  log("buildPromoEventMap:time", { nowISO: safeToISOString(now), nowMinutes });

  const [businesses, events, promotions] = await Promise.all([
    includeBusinesses
      ? Business.find({ placeId: { $in: ids } }).select(businessSelect).lean()
      : Promise.resolve([]),
    Event.find({ placeId: { $in: ids } }).lean(),
    Promotion.find({ placeId: { $in: ids } }).lean(),
  ]);

  log("buildPromoEventMap:db fetched", {
    businesses: businesses.length,
    events: events.length,
    promotions: promotions.length,
  });

  // TRACE: show what DB actually returned for the placeId you care about
  traceLog(TRACE_PLACE_ID, "db events", events.filter((e) => String(e?.placeId) === String(TRACE_PLACE_ID)).map(summarizeDoc));
  traceLog(TRACE_PLACE_ID, "db promotions", promotions.filter((p) => String(p?.placeId) === String(TRACE_PLACE_ID)).map(summarizeDoc));

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

    if (!kind) {
      traceLog(key, "event skipped (not active/upcoming)", summarizeDoc(event));
      continue;
    }

    map[key].events.push({ ...event, kind });
    if (kind === "activeEvent") map[key]._activeCount += 1;
    else map[key]._upcomingCount += 1;

    traceLog(key, "event attached", { kind, event: summarizeDoc(event) });
  }

  // Attach only ACTIVE / UPCOMING-TODAY promos
  for (const promo of promotions) {
    const key = String(promo?.placeId);
    if (!map[key]) continue;

    let kind = null;
    if (isPromoActive(promo, nowMinutes, now)) kind = "activePromo";
    else if (isPromoLaterToday(promo, nowMinutes, now)) kind = "upcomingPromo";

    if (!kind) {
      traceLog(key, "promo skipped (not active/upcoming)", summarizeDoc(promo));
      continue;
    }

    map[key].promotions.push({ ...promo, kind });
    if (kind === "activePromo") map[key]._activeCount += 1;
    else map[key]._upcomingCount += 1;

    traceLog(key, "promo attached", { kind, promo: summarizeDoc(promo) });
  }

  for (const pid of Object.keys(map)) {
    const active = map[pid]._activeCount > 0;
    const upcoming = map[pid]._upcomingCount > 0;
    map[pid].promoRank = active ? 2 : upcoming ? 1 : 0;
  }

  traceLog(TRACE_PLACE_ID, "final bucket", {
    placeId: TRACE_PLACE_ID,
    promoRank: map[TRACE_PLACE_ID]?.promoRank,
    eventsCount: map[TRACE_PLACE_ID]?.events?.length || 0,
    promotionsCount: map[TRACE_PLACE_ID]?.promotions?.length || 0,
  });

  return map;
}

/**
 * Hydrate an array of Google places-like objects (place_id) with
 * { events, promotions, promoRank } using DB promos/events.
 */
async function hydratePlacesWithPromosEvents({ places, now = new Date() } = {}) {
  const list = Array.isArray(places) ? places : [];
  const placeIds = list.map((p) => p?.place_id).filter(Boolean).map(String);

  log("hydratePlacesWithPromosEvents:start", {
    placesIn: list.length,
    uniquePlaceIds: new Set(placeIds).size,
    nowISO: safeToISOString(now),
  });

  const map = await buildPromoEventMap({ placeIds, includeBusinesses: false, now });

  const hydrated = list.map((p) => {
    const key = String(p?.place_id || "");
    const bucket = map[key];

    const out = bucket
      ? { ...p, events: bucket.events, promotions: bucket.promotions, promoRank: bucket.promoRank }
      : { ...p, events: [], promotions: [], promoRank: 0 };

    traceLog(key, "hydrated place result", {
      place_id: key,
      name: p?.name || null,
      promoRank: out.promoRank,
      events: (out.events || []).map((x) => x?.kind),
      promos: (out.promotions || []).map((x) => x?.kind),
    });

    return out;
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
