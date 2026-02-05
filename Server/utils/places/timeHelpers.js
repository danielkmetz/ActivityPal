function parseWhenAtISO(v) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Supports either query.timeZone (IANA string) OR query.tzOffsetMinutes (number)
function getLocalDayAndMinute(date, { timeZone, tzOffsetMinutes } = {}) {
  const d = date instanceof Date ? date : new Date(date);

  // Preferred: IANA timeZone (America/Chicago, etc.)
  if (timeZone && typeof timeZone === "string") {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);

      const wk = parts.find((p) => p.type === "weekday")?.value;
      const hh = Number(parts.find((p) => p.type === "hour")?.value);
      const mm = Number(parts.find((p) => p.type === "minute")?.value);

      const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const day = map[wk];

      if (day == null || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;

      return { day, minuteOfDay: hh * 60 + mm };
    } catch {
      // fall through
    }
  }

  // Fallback: numeric offset minutes
  const off = Number(tzOffsetMinutes);
  if (Number.isFinite(off) && Math.abs(off) <= 14 * 60) {
    // Treat off as "minutes to add to UTC to get local time"
    const shifted = new Date(d.getTime() + off * 60 * 1000);
    const day = shifted.getUTCDay();
    const minuteOfDay = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    return { day, minuteOfDay };
  }

  // Last resort: server local (bad on AWS if UTC)
  return { day: d.getDay(), minuteOfDay: d.getHours() * 60 + d.getMinutes() };
}

function minutesOfWeek(day, minuteOfDay) {
  return day * 1440 + minuteOfDay;
}

function isOpenAtTarget({ place, targetAt, timeCtx } = {}) {
  const periods = place?.regularOpeningHours?.periods;
  if (!Array.isArray(periods) || !periods.length) return null;

  const loc = getLocalDayAndMinute(targetAt, {
    timeZone: timeCtx?.timeZone,
    tzOffsetMinutes: timeCtx?.tzOffsetMinutes,
  });
  if (!loc) return null;

  const t0 = minutesOfWeek(loc.day, loc.minuteOfDay);
  const t1 = t0 + 7 * 1440; // also test wrapped week

  for (const p of periods) {
    const o = p?.open;
    const c = p?.close;

    if (!o || typeof o.day !== "number") continue;

    const oh = Number(o.hour ?? 0);
    const om = Number(o.minute ?? 0);
    if (!Number.isFinite(oh) || !Number.isFinite(om)) continue;

    const openMin = minutesOfWeek(o.day, oh * 60 + om);

    // If no close, treat as open-ended
    if (!c || typeof c.day !== "number") return true;

    const ch = Number(c.hour ?? 0);
    const cm = Number(c.minute ?? 0);
    if (!Number.isFinite(ch) || !Number.isFinite(cm)) continue;

    let closeMin = minutesOfWeek(c.day, ch * 60 + cm);

    // Defensive: if close <= open, assume it wraps forward
    if (closeMin <= openMin) closeMin += 7 * 1440;

    const inRange =
      (t0 >= openMin && t0 < closeMin) ||
      (t1 >= openMin && t1 < closeMin);

    if (inRange) return true;
  }

  return false;
}

module.exports = {
  parseWhenAtISO,
  isOpenAtTarget,
  getLocalDayAndMinute,
  minutesOfWeek,
};
