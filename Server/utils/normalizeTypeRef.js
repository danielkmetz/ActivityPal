function normalizeTypeRef(q) {
  if (!q) return null;
  const s = String(q).toLowerCase();
  if (s === 'review' || s === 'reviews') return 'Review';
  if (s === 'checkin' || s === 'checkins' || s === 'check-in' || s === 'check-ins') return 'CheckIn';
  if (s === 'invite' || s === 'invites' || s === 'activityinvite' || s === 'activityinvites') return 'ActivityInvite';
  return null;
}

module.exports = { normalizeTypeRef }