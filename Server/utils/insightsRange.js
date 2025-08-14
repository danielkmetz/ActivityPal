const INTERVALS = new Set(['day','week','month']);

exports.parseRange = function parseRange({ rangeStart, rangeEnd, interval }) {
  const unit = ['day','week','month'].includes(interval) ? interval : 'day';
  const start = rangeStart ? new Date(rangeStart + 'T00:00:00Z') : new Date('1970-01-01T00:00:00Z');
  const end   = rangeEnd   ? new Date(rangeEnd   + 'T23:59:59Z') : new Date();

  // align to bucket boundaries (important!)
  const alignedStart = unit === 'week' ? startOfUtcWeekMonday(start)
                      : unit === 'month' ? startOfUtcMonth(start)
                      : startOfUtcDay(start);
  // Make end inclusive up to end-of-bucket
  let alignedEnd;
  if (unit === 'week') {
    const next = new Date(startOfUtcWeekMonday(end).getTime() + 7*24*60*60*1000);
    alignedEnd = new Date(next.getTime() - 1);    // last ms of that week window
  } else if (unit === 'month') {
    const y = end.getUTCFullYear(), m = end.getUTCMonth();
    const next = new Date(Date.UTC(y, m + 1, 1));
    alignedEnd = new Date(next.getTime() - 1);
  } else {
    const next = new Date(startOfUtcDay(end).getTime() + 24*60*60*1000);
    alignedEnd = new Date(next.getTime() - 1);
  }

  return { start: alignedStart, end: alignedEnd, unit };
};

function startOfUtcDay(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return x;
}

function startOfUtcWeekMonday(d) {
  const day = d.getUTCDay();         // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7;        // days since Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diff);
  return startOfUtcDay(monday);
}

function startOfUtcMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

exports.generateUtcBuckets = function generateUtcBuckets(start, end, unit) {
  if (!start || !end) return [];
  let cur;
  if (unit === 'week') cur = startOfUtcWeekMonday(start);
  else if (unit === 'month') cur = startOfUtcMonth(start);
  else cur = startOfUtcDay(start);

  const keys = [];
  while (cur <= end) {
    keys.push(cur.toISOString());
    if (unit === 'week') {
      cur = new Date(cur.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (unit === 'month') {
      const y = cur.getUTCFullYear(), m = cur.getUTCMonth();
      cur = new Date(Date.UTC(y, m + 1, 1));
    } else {
      cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
    }
  }
  return keys;
};
