const haversineDistance = require('./haversineDistance');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const { DateTime } = require("luxon");
const Event = require('../models/Events');
const Promotion = require('../models/Promotions');
const { enrichComments } = require('./userPosts');

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
    if (!isRecurringToday) {
      // May still be active from a promo that started yesterday
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yesterdayWeekday = yesterday.toLocaleString('en-US', { weekday: 'long' });
      const isRecurringYesterday = Array.isArray(promo.recurringDays) && promo.recurringDays.includes(yesterdayWeekday);
      if (!isRecurringYesterday) return false;
    }
  }

  if (promo.allDay) return true;
  if (!promo.startTime || !promo.endTime) return false;

  const startMin = parseTimeToMinutes(promo.startTime);
  const endMin = parseTimeToMinutes(promo.endTime);

  if (endMin >= startMin) {
    // Normal same-day promo
    return nowMinutes >= startMin && nowMinutes <= endMin;
  } else {
    // Cross-midnight promo
    const isRecurringToday = Array.isArray(promo.recurringDays) && promo.recurringDays.includes(weekday);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayWeekday = yesterday.toLocaleString('en-US', { weekday: 'long' });
    const isRecurringYesterday = Array.isArray(promo.recurringDays) && promo.recurringDays.includes(yesterdayWeekday);

    const activeLate = isRecurringToday && nowMinutes >= startMin;
    const activeEarly = isRecurringYesterday && nowMinutes <= endMin;

    return activeLate || activeEarly;
  }
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

async function enrichBusinessWithPromosAndEvents(biz, userLat, userLng, now = new Date()) {
  if (!biz?.placeId || !biz?.location) {
    console.warn("⚠️ Missing placeId or location on business:", biz);
    return null;
  }

  const [bizLng, bizLat] = biz.location.coordinates;
  if (isNaN(bizLat) || isNaN(bizLng)) {
    console.warn("⚠️ Invalid coordinates:", biz.location.coordinates);
    return null;
  }

  const distance = haversineDistance(userLat, userLng, bizLat, bizLng);
  const nowLocal = DateTime.fromJSDate(now).toLocal();
  const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;
  
  const [promotionsRaw, eventsRaw] = await Promise.all([
    Promotion.find({ placeId: biz.placeId }).lean(),
    Event.find({ placeId: biz.placeId }).lean()
  ]);

  const promotions = Array.isArray(promotionsRaw) ? promotionsRaw : [];
  const events = Array.isArray(eventsRaw) ? eventsRaw : [];

  const activePromo = promotions.find(p => isPromoActive(p, nowMinutes, now));
  const upcomingPromo = promotions.find(p => isPromoLaterToday(p, nowMinutes, now));
  const activeEvent = events.find(e => isEventActive(e, nowMinutes, now));
  const upcomingEvent = events.find(e => isEventLaterToday(e, nowMinutes, now));

  if (!activePromo && !upcomingPromo && !activeEvent && !upcomingEvent) {
    return null;
  }

  const { businessName, placeId, location } = biz;
  const logoUrl = await getCachedUrl(logoUrlCache, biz.logoKey);
  const bannerUrl = await getCachedUrl(bannerUrlCache, biz.bannerKey);

  const cleanAndEnrich = async (entry) =>
    entry ? {
      ...leanObject(entry),
      photos: await enrichPhotosWithUrls(entry.photos || []),
      comments: await enrichComments(entry.comments || []),
      type: "suggestion",
    } : null;

  const result = {
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

  console.log(`✅ Enriched suggestion created for "${businessName}"`);
  return result;
}

module.exports = { enrichBusinessWithPromosAndEvents };
