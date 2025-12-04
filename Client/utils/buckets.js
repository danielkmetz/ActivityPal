export function getBucketKeyFromMs(startTimeMs) {
  if (!startTimeMs) return 'later';

  const dt = new Date(startTimeMs);
  if (Number.isNaN(dt.getTime())) return 'later';

  const now = new Date();

  const midnightNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const midnightDt = new Date(
    dt.getFullYear(),
    dt.getMonth(),
    dt.getDate()
  );

  const diffDays =
    (midnightDt.getTime() - midnightNow.getTime()) /
    (1000 * 60 * 60 * 24);

  if (diffDays === 0) return 'tonight';
  if (diffDays === 1) return 'tomorrow';

  const day = dt.getDay(); // 0–6 (Sun–Sat)
  const isWeekend = day === 5 || day === 6 || day === 0;

  if (diffDays > 1 && diffDays <= 7 && isWeekend) {
    return 'weekend';
  }

  return 'later';
}

export function labelForBucket(bucketKey) {
  if (bucketKey === 'tonight') return 'Tonight';
  if (bucketKey === 'tomorrow') return 'Tomorrow';
  if (bucketKey === 'weekend') return 'This weekend';
  return 'Upcoming';
}
