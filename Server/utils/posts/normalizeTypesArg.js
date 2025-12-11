const ALLOWED_TYPES = new Set([
  'review', 'check-in', 'invite', 'event', 'promotion', 'sharedPost', 'liveStream', 'post',
]);

function normalizeTypesArg(types) {
  if (!types) return null; // caller didn't request any filter

  const list = Array.isArray(types) ? types : String(types).split(',');
  const cleaned = list.map((t) => String(t).trim()).filter(Boolean);
  const allowed = cleaned.filter((t) => ALLOWED_TYPES.has(t));

  // return empty array to signal: "they tried to filter, but nothing valid"
  return allowed;
}

module.exports = { normalizeTypesArg }