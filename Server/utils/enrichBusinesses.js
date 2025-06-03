const haversineDistance = require('./haversineDistance');

/**
 * Parses a time string (e.g., "13:30") into minutes since midnight.
 */
const parseTimeToMinutes = (timeStr) => {
  const [hour, minute] = timeStr.split(':').map(Number);
  return hour * 60 + minute;
};

/**
 * Determines if a promo is currently active.
 */
const isPromoActive = (promo, nowMinutes, now) => {
  const inDateRange = now >= promo.startDate && now <= promo.endDate;
  if (!inDateRange) return false;
  if (promo.allDay) return true;
  if (!promo.startTime || !promo.endTime) return false;

  const startMin = parseTimeToMinutes(promo.startTime);
  const endMin = parseTimeToMinutes(promo.endTime);
  return nowMinutes >= startMin && nowMinutes <= endMin;
};

/**
 * Determines if an event is currently active.
 */
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

/**
 * Enriches a business with active promo/event and distance, or returns null.
 */
function enrichBusinessWithPromosAndEvents(biz, userLat, userLng, now = new Date()) {
  if (!biz?.location) return null;

  const [bizLat, bizLng] = biz.location.split(',').map(Number);
  if (isNaN(bizLat) || isNaN(bizLng)) return null;

  const distance = haversineDistance(userLat, userLng, bizLat, bizLng);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const promo = (biz.promotions || []).find(p => isPromoActive(p, nowMinutes, now));
  const event = (biz.events || []).find(e => isEventActive(e, nowMinutes, now));

  if (!promo && !event) return null;

  return {
    businessName: biz.businessName,
    placeId: biz.placeId,
    location: biz.location,
    logoKey: biz.logoKey,
    bannerKey: biz.bannerKey,
    distance,
    activePromo: promo || null,
    activeEvent: event || null,
  };
}

module.exports = { enrichBusinessWithPromosAndEvents };
