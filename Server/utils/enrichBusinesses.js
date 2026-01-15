const { haversineDistance } = require('./haversineDistance');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const { DateTime } = require("luxon");
const { enrichComments } = require('./userPosts');

/**
 * Cache to avoid redundant URL generations per request context.
 */
const logoUrlCache = new Map();
const bannerUrlCache = new Map();

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

const isPromoLaterToday = (promo, nowMinutes, now) => {
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const todayStr = now.toDateString();

  const isRecurringToday =
    promo.recurring &&
    Array.isArray(promo.recurringDays) &&
    promo.recurringDays.includes(weekday);

  const isSingleDateToday =
    !promo.recurring &&
    promo.date &&
    new Date(promo.date).toDateString() === todayStr;

  if (!isRecurringToday && !isSingleDateToday) return false;
  if (promo.allDay) return false;
  if (!promo.startTime || !promo.endTime) return false;

  const startMin = parseTimeToMinutes(promo.startTime);
  if (startMin == null) return false;

  return startMin > nowMinutes;
};

const isEventLaterToday = (event, nowMinutes, now) => {
  const weekday = now.toLocaleString('en-US', { weekday: 'long' });
  const todayStr = now.toDateString();

  const isRecurringToday =
    event.recurring &&
    Array.isArray(event.recurringDays) &&
    event.recurringDays.includes(weekday);

  const isSingleDateToday =
    !event.recurring &&
    event.date &&
    new Date(event.date).toDateString() === todayStr;

  if (!isRecurringToday && !isSingleDateToday) return false;
  if (event.allDay) return false;
  if (!event.startTime) return false;

  const startMin = parseTimeToMinutes(event.startTime);
  return startMin > nowMinutes;
};

const isPromoActive = (promo, nowMinutes, now) => {
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const todayStr = now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const yesterdayWeekday = yesterday.toLocaleString("en-US", { weekday: "long" });

  const isTodayRecurring =
    promo.recurring && Array.isArray(promo.recurringDays) && promo.recurringDays.includes(weekday);

  const isYesterdayRecurring =
    promo.recurring && Array.isArray(promo.recurringDays) && promo.recurringDays.includes(yesterdayWeekday);

  const isDateMatchToday =
    !promo.recurring &&
    promo.date &&
    new Date(promo.date).toDateString() === todayStr;

  const isDateMatchYesterday =
    !promo.recurring &&
    promo.date &&
    new Date(promo.date).toDateString() === yesterdayStr;

  // All-day promo: active if it applies to today
  if (promo.allDay) {
    return isTodayRecurring || isDateMatchToday;
  }

  if (!promo.startTime || !promo.endTime) return false;

  const startMin = parseTimeToMinutes(promo.startTime);
  const endMin = parseTimeToMinutes(promo.endTime);
  if (startMin == null || endMin == null) return false;

  if (endMin >= startMin) {
    // Normal same-day promo
    if (isTodayRecurring || isDateMatchToday) {
      return nowMinutes >= startMin && nowMinutes <= endMin;
    }
  } else {
    // Cross-midnight promo (e.g. 9pm–2am)
    const activeLate =
      (isTodayRecurring || isDateMatchToday) && nowMinutes >= startMin;
    const activeEarly =
      (isYesterdayRecurring || isDateMatchYesterday) && nowMinutes <= endMin;
    return activeLate || activeEarly;
  }

  return false;
};

const isEventActive = (event, nowMinutes, now) => {
  const weekday = now.toLocaleString('en-US', { weekday: 'long' });
  const todayStr = now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const yesterdayWeekday = yesterday.toLocaleString('en-US', { weekday: 'long' });

  const isTodayRecurring = event.recurring && event.recurringDays?.includes(weekday);
  const isYesterdayRecurring = event.recurring && event.recurringDays?.includes(yesterdayWeekday);
  const isDateMatchToday = event.date && new Date(event.date).toDateString() === todayStr;
  const isDateMatchYesterday = event.date && new Date(event.date).toDateString() === yesterdayStr;

  if (event.allDay) return isTodayRecurring || isDateMatchToday;

  if (!event.startTime || !event.endTime) return false;

  const startMin = parseTimeToMinutes(event.startTime);
  const endMin = parseTimeToMinutes(event.endTime);

  if (endMin >= startMin) {
    // Normal same-day event
    if (isTodayRecurring || isDateMatchToday) {
      return nowMinutes >= startMin && nowMinutes <= endMin;
    }
  } else {
    // Cross-midnight event
    const activeLate = (isTodayRecurring || isDateMatchToday) && nowMinutes >= startMin;
    const activeEarly = (isYesterdayRecurring || isDateMatchYesterday) && nowMinutes <= endMin;
    return activeLate || activeEarly;
  }

  return false;
};

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
  const upcomingPromos = promotions.filter((p) => isPromoLaterToday(p, nowMinutes, now));
  const activeEvents = events.filter((e) => isEventActive(e, nowMinutes, now));
  const upcomingEvents = events.filter((e) => isEventLaterToday(e, nowMinutes, now));

  // ✅ real early exit
  if (
    activePromos.length === 0 &&
    upcomingPromos.length === 0 &&
    activeEvents.length === 0 &&
    upcomingEvents.length === 0
  ) {
    return null;
  }

  // Prefer per-request caches so you don't leak memory across days of traffic
  const lCache = logoCache || new Map();
  const bCache = bannerCache || new Map();

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
