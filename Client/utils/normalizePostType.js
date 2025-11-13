export const normalizePostType = (input) => {
  if (input == null) return null;

  // Allow objects like { type: 'Review' } or { kind: 'check-in' }
  let raw =
    typeof input === 'string'
      ? input
      : (input.type || input.kind || input.name || input.postType || '');

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
  };

  return ALIAS[raw] || ALIAS[collapsed] || null;
};
