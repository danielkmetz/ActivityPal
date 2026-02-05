function canComputeOpenAt(timeCtx) {
  return !!timeCtx?.timeZone || Number.isFinite(Number(timeCtx?.tzOffsetMinutes));
}

function effectiveTimeCtxForPlace(baseTimeCtx, place) {
  if (canComputeOpenAt(baseTimeCtx)) return baseTimeCtx;

  const u = place?.utcOffsetMinutes;
  const n = u == null ? null : Number(u);

  if (Number.isFinite(n) && Math.abs(n) <= 14 * 60) {
    return { timeZone: null, tzOffsetMinutes: Math.trunc(n) };
  }

  return baseTimeCtx;
}

module.exports = { canComputeOpenAt, effectiveTimeCtxForPlace };
