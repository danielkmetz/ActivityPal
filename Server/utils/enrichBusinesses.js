const { haversineDistance } = require("./haversineDistance");
const { getPresignedUrl } = require("../utils/cachePresignedUrl");
const { DateTime } = require("luxon");
const { enrichComments } = require("./userPosts");

/**
 * Cache to avoid redundant URL generations per request context.
 */
const logoUrlCache = new Map();
const bannerUrlCache = new Map();

// =====================
// Time parsing
// =====================
// IMPORTANT: zone:"utc" then .toLocal() only works if startTime/endTime are ISO strings (or Dates).
const parseTimeToMinutes = (value) => {
  if (!value) return null;

  let dt;
  if (value instanceof Date) {
    dt = DateTime.fromJSDate(value, { zone: "utc" }).toLocal();
  } else {
    dt = DateTime.fromISO(String(value), { zone: "utc" }).toLocal();
  }

  if (!dt.isValid) return null;
  return dt.hour * 60 + dt.minute;
};

// =====================
// Explain helpers (return { ok, reason, details })
// =====================
const explainPromoLaterToday = (promo, nowMinutes, now) => {
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const todayStr = now.toDateString();

  const isRecurringToday =
    promo.recurring &&
    Array.isArray(promo.recurringDays) &&
    promo.recurringDays.includes(weekday);

  const isSingleDateToday =
    !promo.recurring && promo.date && new Date(promo.date).toDateString() === todayStr;

  if (!isRecurringToday && !isSingleDateToday) {
    return { ok: false, reason: "not_today", details: { weekday, todayStr } };
  }
  if (promo.allDay) return { ok: false, reason: "all_day_not_upcoming" };
  if (!promo.startTime || !promo.endTime) {
    return {
      ok: false,
      reason: "missing_start_or_end",
      details: { startTime: promo.startTime, endTime: promo.endTime },
    };
  }

  const startMin = parseTimeToMinutes(promo.startTime);
  if (startMin == null) {
    return { ok: false, reason: "invalid_startTime_parse", details: { startTime: promo.startTime } };
  }

  const ok = startMin > nowMinutes;
  return ok
    ? { ok: true }
    : { ok: false, reason: "start_not_after_now", details: { startMin, nowMinutes } };
};

const explainEventLaterToday = (event, nowMinutes, now) => {
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const todayStr = now.toDateString();

  const isRecurringToday =
    event.recurring &&
    Array.isArray(event.recurringDays) &&
    event.recurringDays.includes(weekday);

  const isSingleDateToday =
    !event.recurring && event.date && new Date(event.date).toDateString() === todayStr;

  if (!isRecurringToday && !isSingleDateToday) {
    return { ok: false, reason: "not_today", details: { weekday, todayStr } };
  }
  if (event.allDay) return { ok: false, reason: "all_day_not_upcoming" };
  if (!event.startTime) return { ok: false, reason: "missing_startTime" };

  const startMin = parseTimeToMinutes(event.startTime);
  if (startMin == null) {
    return { ok: false, reason: "invalid_startTime_parse", details: { startTime: event.startTime } };
  }

  const ok = startMin > nowMinutes;
  return ok
    ? { ok: true }
    : { ok: false, reason: "start_not_after_now", details: { startMin, nowMinutes } };
};

const explainPromoActive = (promo, nowMinutes, now) => {
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const todayStr = now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const yesterdayWeekday = yesterday.toLocaleString("en-US", { weekday: "long" });

  const isTodayRecurring =
    promo.recurring &&
    Array.isArray(promo.recurringDays) &&
    promo.recurringDays.includes(weekday);

  const isYesterdayRecurring =
    promo.recurring &&
    Array.isArray(promo.recurringDays) &&
    promo.recurringDays.includes(yesterdayWeekday);

  const isDateMatchToday =
    !promo.recurring && promo.date && new Date(promo.date).toDateString() === todayStr;

  const isDateMatchYesterday =
    !promo.recurring && promo.date && new Date(promo.date).toDateString() === yesterdayStr;

  if (promo.allDay) {
    const ok = isTodayRecurring || isDateMatchToday;
    return ok
      ? { ok: true }
      : { ok: false, reason: "all_day_but_not_today", details: { weekday, todayStr } };
  }

  if (!promo.startTime || !promo.endTime) {
    return {
      ok: false,
      reason: "missing_start_or_end",
      details: { startTime: promo.startTime, endTime: promo.endTime },
    };
  }

  const startMin = parseTimeToMinutes(promo.startTime);
  const endMin = parseTimeToMinutes(promo.endTime);
  if (startMin == null || endMin == null) {
    return {
      ok: false,
      reason: "invalid_time_parse",
      details: { startTime: promo.startTime, endTime: promo.endTime, startMin, endMin },
    };
  }

  if (endMin >= startMin) {
    if (!(isTodayRecurring || isDateMatchToday)) {
      return { ok: false, reason: "same_day_not_today", details: { weekday, todayStr } };
    }
    const ok = nowMinutes >= startMin && nowMinutes <= endMin;
    return ok
      ? { ok: true }
      : { ok: false, reason: "outside_window", details: { startMin, endMin, nowMinutes } };
  } else {
    const activeLate = (isTodayRecurring || isDateMatchToday) && nowMinutes >= startMin;
    const activeEarly = (isYesterdayRecurring || isDateMatchYesterday) && nowMinutes <= endMin;
    const ok = activeLate || activeEarly;
    return ok
      ? { ok: true }
      : {
          ok: false,
          reason: "cross_midnight_not_active",
          details: { startMin, endMin, nowMinutes },
        };
  }
};

const explainEventActive = (event, nowMinutes, now) => {
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const todayStr = now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const yesterdayWeekday = yesterday.toLocaleString("en-US", { weekday: "long" });

  const isTodayRecurring =
    event.recurring &&
    Array.isArray(event.recurringDays) &&
    event.recurringDays.includes(weekday);

  const isYesterdayRecurring =
    event.recurring &&
    Array.isArray(event.recurringDays) &&
    event.recurringDays.includes(yesterdayWeekday);

  const isDateMatchToday =
    !event.recurring && event.date && new Date(event.date).toDateString() === todayStr;

  const isDateMatchYesterday =
    !event.recurring && event.date && new Date(event.date).toDateString() === yesterdayStr;

  if (event.allDay) {
    const ok = isTodayRecurring || isDateMatchToday;
    return ok
      ? { ok: true }
      : { ok: false, reason: "all_day_but_not_today", details: { weekday, todayStr } };
  }

  if (!event.startTime || !event.endTime) {
    return {
      ok: false,
      reason: "missing_start_or_end",
      details: { startTime: event.startTime, endTime: event.endTime },
    };
  }

  const startMin = parseTimeToMinutes(event.startTime);
  const endMin = parseTimeToMinutes(event.endTime);
  if (startMin == null || endMin == null) {
    return {
      ok: false,
      reason: "invalid_time_parse",
      details: { startTime: event.startTime, endTime: event.endTime, startMin, endMin },
    };
  }

  if (endMin >= startMin) {
    if (!(isTodayRecurring || isDateMatchToday)) {
      return { ok: false, reason: "same_day_not_today", details: { weekday, todayStr } };
    }
    const ok = nowMinutes >= startMin && nowMinutes <= endMin;
    return ok
      ? { ok: true }
      : { ok: false, reason: "outside_window", details: { startMin, endMin, nowMinutes } };
  } else {
    const activeLate = (isTodayRecurring || isDateMatchToday) && nowMinutes >= startMin;
    const activeEarly = (isYesterdayRecurring || isDateMatchYesterday) && nowMinutes <= endMin;
    const ok = activeLate || activeEarly;
    return ok
      ? { ok: true }
      : {
          ok: false,
          reason: "cross_midnight_not_active",
          details: { startMin, endMin, nowMinutes },
        };
  }
};

// =====================
// Public API
// =====================
const isPromoLaterToday = (promo, nowMinutes, now) => explainPromoLaterToday(promo, nowMinutes, now).ok;
const isEventLaterToday = (event, nowMinutes, now) => explainEventLaterToday(event, nowMinutes, now).ok;
const isPromoActive = (promo, nowMinutes, now) => explainPromoActive(promo, nowMinutes, now).ok;
const isEventActive = (event, nowMinutes, now) => explainEventActive(event, nowMinutes, now).ok;

// =====================
// URL / enrichment helpers
// =====================
async function enrichPhotosWithUrls(photos = []) {
  return Promise.all(
    photos.map(async (photo) => {
      const lean = photo?.toObject?.() ?? photo;
      return {
        photoKey: lean.photoKey,
        uploadedBy: lean.uploadedBy,
        description: lean.description,
        taggedUsers: lean.taggedUsers,
        uploadDate: lean.uploadDate,
        url: await getPresignedUrl(lean.photoKey),
      };
    })
  );
}

async function getCachedUrl(cache, key) {
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const url = await getPresignedUrl(key);
  cache.set(key, url);
  return url;
}

function leanObject(obj) {
  return obj?.toObject?.() ?? obj;
}

// =====================
// Main business enrichment (may not be used by /places hydration path)
// =====================
async function enrichBusinessWithPromosAndEvents(
  biz,
  userLat,
  userLng,
  promosForBiz,
  eventsForBiz,
  now = new Date(),
  { logoCache, bannerCache } = {}
) {
  if (!biz?.placeId || !biz?.location) return null;

  const [bizLng, bizLat] = biz.location.coordinates || [];
  if (isNaN(bizLat) || isNaN(bizLng)) return null;

  const distance = haversineDistance(userLat, userLng, bizLat, bizLng);

  const nowLocal = DateTime.fromJSDate(now).toLocal();
  const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;

  const promotions = Array.isArray(promosForBiz) ? promosForBiz : [];
  const events = Array.isArray(eventsForBiz) ? eventsForBiz : [];

  const activePromos = promotions.filter((p) => isPromoActive(p, nowMinutes, now));
  const upcomingPromos = promotions.filter(
    (p) => !isPromoActive(p, nowMinutes, now) && isPromoLaterToday(p, nowMinutes, now)
  );
  const activeEvents = events.filter((e) => isEventActive(e, nowMinutes, now));
  const upcomingEvents = events.filter(
    (e) => !isEventActive(e, nowMinutes, now) && isEventLaterToday(e, nowMinutes, now)
  );

  if (
    activePromos.length === 0 &&
    upcomingPromos.length === 0 &&
    activeEvents.length === 0 &&
    upcomingEvents.length === 0
  ) {
    return null;
  }

  const lCache = logoCache || logoUrlCache || new Map();
  const bCache = bannerCache || bannerUrlCache || new Map();

  const logoUrl = await getCachedUrl(lCache, biz.logoKey);
  const bannerUrl = await getCachedUrl(bCache, biz.bannerKey);

  const cleanAndEnrichMany = async (entries = []) =>
    Promise.all(
      entries.map(async (entry) => ({
        ...leanObject(entry),
        photos: await enrichPhotosWithUrls(entry.photos || []),
        comments: await enrichComments(entry.comments || []),
        type: "suggestion",
      }))
    );

  return {
    businessName: biz.businessName,
    placeId: biz.placeId,
    location: biz.location,
    logoUrl,
    bannerUrl,
    distance,
    activePromos: await cleanAndEnrichMany(activePromos),
    upcomingPromos: await cleanAndEnrichMany(upcomingPromos),
    activeEvents: await cleanAndEnrichMany(activeEvents),
    upcomingEvents: await cleanAndEnrichMany(upcomingEvents),
  };
}

module.exports = {
  enrichBusinessWithPromosAndEvents,
  isEventActive,
  isEventLaterToday,
  isPromoActive,
  isPromoLaterToday,
};
