const INTERVALS = new Set(['day','week','month']);

exports.parseRange = ({ rangeStart, rangeEnd, interval }) => {
  const end = rangeEnd ? new Date(rangeEnd) : new Date();            // now
  const start = rangeStart ? new Date(rangeStart) : new Date(end);   // default 30d
  if (!rangeStart) start.setUTCDate(end.getUTCDate() - 29);          // last 30 days
  const unit = INTERVALS.has((interval||'day')) ? interval : 'day';
  return { start, end, unit };
};

exports.generateUtcBuckets = (start, end, unit='day') => {
  const add = (d) => {
    const x = new Date(d);
    if (unit === 'day')   x.setUTCDate(x.getUTCDate()+1);
    if (unit === 'week')  x.setUTCDate(x.getUTCDate()+7);
    if (unit === 'month') x.setUTCMonth(x.getUTCMonth()+1);
    return x;
  };
  const floor = (d) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    if (unit === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    if (unit === 'week') {
      const dow = x.getUTCDay(); // 0=Sun
      // start weeks on Monday (ISO) — adjust if you prefer Sunday
      const delta = (dow+6)%7; // days since Monday
      x.setUTCDate(x.getUTCDate() - delta);
    }
    return x;
  };
  const buckets = [];
  let cur = floor(start);
  while (cur <= end) {
    buckets.push(cur.toISOString());
    cur = add(cur);
  }
  return buckets;
};
