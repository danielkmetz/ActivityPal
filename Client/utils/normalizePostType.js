export const normalizePostType = (input) => {
  if (input == null) return null;

  let raw;
  let kindRaw;

  if (typeof input === 'string') {
    raw = input;
  } else {
    kindRaw = input.kind;

    // Prefer kind if this is a "suggestion" wrapper
    if (input.type === 'suggestion' && kindRaw) {
      raw = kindRaw;
    } else {
      raw = input.type || kindRaw || input.name || input.postType || '';
    }
  }

  raw = String(raw).trim().toLowerCase();

  // Collapse separators and non-letters: "Check-In", "check_in", "check in" -> "checkin"
  const collapsed = raw.replace(/[^a-z]/g, '');

  // Direct alias map (check both raw and collapsed)
  const ALIAS = {
    review: 'review',
    reviews: 'review',
    rev: 'review',
    rvw: 'review',
    rv: 'review',

    'check-in': 'check-in',
    'check-ins': 'check-in',
    checkin: 'check-in',
    checkins: 'check-in',
    ci: 'check-in',

    event: 'event',
    events: 'event',
    evt: 'event',

    promotion: 'promotion',
    promotions: 'promotion',
    promo: 'promotion',
    promos: 'promotion',
    pr: 'promotion',

    sharedpost: 'sharedPost',
    shared: 'sharedPost',

    livestream: 'liveStream',
    live: 'liveStream',

    suggestion: 'suggestion',
    suggestions: 'suggestion',
  };

  // Special handling for kinds like "upcomingEvent", "activeEvent",
  // "upcomingPromotion", "activePromotion", etc.
  if (collapsed.includes('upcoming') || collapsed.includes('active')) {
    if (collapsed.includes('event')) {
      return 'event';
    }
    if (collapsed.includes('promo') || collapsed.includes('promotion')) {
      return 'promotion';
    }
  }

  return ALIAS[raw] || ALIAS[collapsed] || null;
};
