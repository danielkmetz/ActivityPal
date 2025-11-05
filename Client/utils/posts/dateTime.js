import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

// pick the best date field available
export function pickPostDateField(src) {
  return src?.sortDate || src?.createdAt || src?.date || src?.dateTime || null;
}

// robustly convert seconds / milliseconds / ISO / numeric-string to a valid dayjs
export function toDayjsSafe(input) {
  if (input == null) return null;

  // If it's already a Dayjs, pass through
  if (dayjs.isDayjs?.(input)) return input;

  // Numbers (seconds or milliseconds)
  if (typeof input === 'number') {
    const ms = input > 1e12 ? input : input * 1000;
    const d = dayjs(ms);
    return d.isValid() ? d : null;
  }

  // Numeric strings
  if (typeof input === 'string' && /^\d+$/.test(input)) {
    const num = Number(input);
    const ms = num > 1e12 ? num : num * 1000;
    const d = dayjs(ms);
    return d.isValid() ? d : null;
  }

  // ISO or other date-like strings
  if (typeof input === 'string') {
    const d = dayjs(input);
    return d.isValid() ? d : null;
  }

  // Date object
  if (input instanceof Date) {
    const d = dayjs(input.getTime());
    return d.isValid() ? d : null;
  }

  return null;
}

// choose the correct layer (outer vs inner) and return a Dayjs
export function getDisplayDayjs(post, { embeddedInShared = false } = {}) {
  const isShared = post?.type === 'sharedPost' || post?.postType === 'sharedPost' || !!post?.original;
  const layer = isShared && embeddedInShared ? post?.original : post;
  const raw = pickPostDateField(layer);
  return toDayjsSafe(raw);
}
