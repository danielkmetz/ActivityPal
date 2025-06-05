const haversineDistance = require('./haversineDistance');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const { DateTime } = require("luxon");

/**
 * Cache to avoid redundant URL generations per request context.
 */
const logoUrlCache = new Map();
const bannerUrlCache = new Map();

const parseTimeToMinutes = (isoStr) => {
  const localTime = DateTime.fromISO(isoStr, { zone: 'utc' }).toLocal(); // ✅ converts 1:00 AM UTC to 8:00 PM CDT
  return localTime.hour * 60 + localTime.minute; // = 1200
};

const isPromoLaterToday = (promo, nowMinutes, now) => {
  const inDateRange = now >= promo.startDate && now <= promo.endDate;
  if (!inDateRange) return false;
  if (promo.allDay) return false;
  if (!promo.startTime || !promo.endTime) return false;

  const weekday = now.toLocaleString('en-US', { weekday: 'long' });

  if (promo.recurring) {
    const isRecurringToday = Array.isArray(promo.recurringDays) && promo.recurringDays.includes(weekday);
    if (!isRecurringToday) return false;
  }

  const startMin = parseTimeToMinutes(promo.startTime);
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
  const inDateRange = now >= promo.startDate && now <= promo.endDate;
  if (!inDateRange) return false;

  const weekday = now.toLocaleString('en-US', { weekday: 'long' });

  if (promo.recurring) {
    const isRecurringToday = Array.isArray(promo.recurringDays) && promo.recurringDays.includes(weekday);
    if (!isRecurringToday) return false;
  }

  if (promo.allDay) return true;

  if (!promo.startTime || !promo.endTime) return false;

  const startMin = parseTimeToMinutes(promo.startTime);
  const endMin = parseTimeToMinutes(promo.endTime);
  return nowMinutes >= startMin && nowMinutes <= endMin;
};

const isEventActive = (event, nowMinutes, now) => {
  const todayStr = now.toDateString();
  const weekday = now.toLocaleString('en-US', { weekday: 'long' });

  const isTodayRecurring = event.recurring && event.recurringDays?.includes(weekday);
  const isDateMatch = event.date && new Date(event.date).toDateString() === todayStr;

  if (!isTodayRecurring && !isDateMatch) return false;
  if (event.allDay) return true;
  if (!event.startTime || !event.endTime) return false;

  const startMin = parseTimeToMinutes(event.startTime);
  const endMin = parseTimeToMinutes(event.endTime);
  return nowMinutes >= startMin && nowMinutes <= endMin;
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

async function enrichBusinessWithPromosAndEvents(biz, userLat, userLng, now = new Date()) {
  if (!biz?.location) return null;

  const [bizLng, bizLat] = biz.location.coordinates;
  if (isNaN(bizLat) || isNaN(bizLng)) return null;

  const distance = haversineDistance(userLat, userLng, bizLat, bizLng);
  const nowLocal = DateTime.fromJSDate(now).toLocal();
  const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;

  const activePromo = (biz.promotions || []).find(p => isPromoActive(p, nowMinutes, now));
  const upcomingPromo = (biz.promotions || []).find(p => isPromoLaterToday(p, nowMinutes, now));

  const activeEvent = (biz.events || []).find(e => isEventActive(e, nowMinutes, now));
  const upcomingEvent = (biz.events || []).find(e => isEventLaterToday(e, nowMinutes, now));

  if (!activePromo && !activeEvent && !upcomingPromo && !upcomingEvent) return null;

  const { businessName, placeId, location, logoKey, bannerKey } = biz;

  const logoUrl = await getCachedUrl(logoUrlCache, biz.logoKey);
  const bannerUrl = await getCachedUrl(bannerUrlCache, biz.bannerKey);

  const cleanAndEnrich = async (entry) =>
    entry ? {
      ...leanObject(entry),
      photos: await enrichPhotosWithUrls(entry.photos || []),
      type: "suggestion",
    } : null;

  return {
    businessName,
    placeId,
    location,
    logoUrl,
    bannerUrl,
    distance,
    activePromo: await cleanAndEnrich(activePromo),
    upcomingPromo: await cleanAndEnrich(upcomingPromo),
    activeEvent: await cleanAndEnrich(activeEvent),
    upcomingEvent: await cleanAndEnrich(upcomingEvent),
  };
}

module.exports = { enrichBusinessWithPromosAndEvents };
