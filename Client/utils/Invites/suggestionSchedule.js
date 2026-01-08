import { extractFormattedAddress } from "../posts/extractFormattedAddress";

/* ------------------------- helpers: recurring logic ------------------------ */

const DAY_LOOKUP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function dayNameToIndex(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase().trim();
  return DAY_LOOKUP[lower] ?? null;
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function buildTodayAtTime(baseTime) {
  const now = new Date();
  const dt = new Date(now);
  dt.setHours(baseTime.getHours(), baseTime.getMinutes(), 0, 0);
  return dt;
}

function getNextRecurringOccurrence(baseStart, recurringDays) {
  if (!baseStart || !Array.isArray(recurringDays) || !recurringDays.length) return null;

  const now = new Date();
  const nowMs = now.getTime();
  const baseHour = baseStart.getHours();
  const baseMinute = baseStart.getMinutes();

  const daySet = new Set(
    recurringDays.map(dayNameToIndex).filter((d) => d != null)
  );
  if (!daySet.size) return null;

  for (let offset = 0; offset < 14; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);

    const weekday = candidate.getDay();
    if (!daySet.has(weekday)) continue;

    candidate.setHours(baseHour, baseMinute, 0, 0);
    if (candidate.getTime() > nowMs) return candidate;
  }

  return null;
}

/* ------------------------ exported suggestion helpers ---------------------- */

export function getSuggestionContent(suggestion) {
  const raw = suggestion ?? null;
  const content = raw?.original ?? raw ?? null;
  const fromSharedPost = !!raw?.original;
  return { rawSuggestion: raw, suggestionContent: content, fromSharedPost };
}

export function deriveSuggestedMeta(suggestionContent) {
  if (!suggestionContent) return null;

  const details = suggestionContent.details || {};

  const rawStart =
    details.startsAt ||
    details.startTime ||
    details.date ||
    suggestionContent.startTime ||
    suggestionContent.startsAt ||
    suggestionContent.date ||
    null;

  const rawEnd = details.endsAt || details.endTime || null;

  let baseStart = null;
  if (rawStart) {
    const t = Date.parse(rawStart);
    if (Number.isFinite(t)) baseStart = new Date(t);
  }

  let baseEnd = null;
  if (rawEnd) {
    const t = Date.parse(rawEnd);
    if (Number.isFinite(t)) baseEnd = new Date(t);
  }

  const recurring =
    typeof details.recurring === "boolean" ? details.recurring : !!suggestionContent.recurring;

  const recurringDays =
    Array.isArray(details.recurringDays) && details.recurringDays.length
      ? details.recurringDays
      : suggestionContent.recurringDays || [];

  const address =
    extractFormattedAddress(suggestionContent) ||
    extractFormattedAddress(details) ||
    null;

  const suggestedVenue =
    suggestionContent?.placeId && suggestionContent?.businessName
      ? {
          kind: "place",
          label: suggestionContent.businessName,
          placeId: suggestionContent.placeId,
          address,
          geo: suggestionContent.location || undefined,
        }
      : null;

  const title = details.title || suggestionContent.title || "";
  const suggestedMessage = suggestionContent?.businessName
    ? `Let's go to ${suggestionContent.businessName}${title ? ` for ${title}` : ""}`.trim()
    : "";

  return { baseStart, baseEnd, recurring, recurringDays, suggestedVenue, suggestedMessage };
}

export function buildScheduleDescriptionFromSuggestion(suggestionContent) {
  if (!suggestionContent?.details) return null;

  const { details } = suggestionContent;
  const { startsAt, endsAt, recurring, recurringDays } = details;

  if (!startsAt) return null;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const hasEnd = !!endsAt;
  const end = hasEnd ? new Date(endsAt) : null;

  const startTime = formatTime(start);
  const endTime = hasEnd && end && !Number.isNaN(end.getTime()) ? formatTime(end) : null;

  if (recurring && Array.isArray(recurringDays) && recurringDays.length) {
    const dayLabels = recurringDays
      .map((name) => {
        const idx = dayNameToIndex(name);
        if (idx == null) return String(name);
        return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][idx];
      })
      .filter(Boolean);

    if (!dayLabels.length) return null;

    let daysStr;
    if (dayLabels.length === 1) daysStr = dayLabels[0];
    else if (dayLabels.length === 2) daysStr = `${dayLabels[0]} and ${dayLabels[1]}`;
    else daysStr = dayLabels.slice(0, -1).join(", ") + " and " + dayLabels[dayLabels.length - 1];

    if (endTime) return `on ${daysStr} between ${startTime} and ${endTime}`;
    return `on ${daysStr} at ${startTime}`;
  }

  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (endTime) return `on ${dateLabel} between ${startTime} and ${endTime}`;
  return `on ${dateLabel} at ${startTime}`;
}

export function computeSuggestedDateTime({ baseStart, recurring, recurringDays, fromSharedPost }) {
  const now = new Date();
  if (!baseStart) return now;

  if (fromSharedPost && recurring && Array.isArray(recurringDays) && recurringDays.length) {
    const next = getNextRecurringOccurrence(baseStart, recurringDays);
    return next || baseStart;
  }

  // non-shared suggestion: treat as a time-of-day, schedule for today
  if (!fromSharedPost) return buildTodayAtTime(baseStart);

  return baseStart;
}

/**
 * Returns null if valid, or a schedule string if invalid.
 */
export function validateAgainstSuggestionDateTime(dt, suggestionContent) {
  if (!suggestionContent?.details) return null;

  const { details } = suggestionContent;
  const { startsAt, endsAt, recurring, recurringDays } = details;

  if (!startsAt) return null;

  const baseStart = new Date(startsAt);
  if (Number.isNaN(baseStart.getTime())) return null;

  const baseEnd = endsAt ? new Date(endsAt) : null;
  const schedule = buildScheduleDescriptionFromSuggestion(suggestionContent);

  if (recurring && Array.isArray(recurringDays) && recurringDays.length) {
    const indices = recurringDays.map(dayNameToIndex).filter((i) => i != null);
    if (indices.length) {
      const chosenDay = dt.getDay();
      if (!indices.includes(chosenDay)) return schedule;
    }
  }

  if (!baseEnd || Number.isNaN(baseEnd.getTime())) return null;

  const baseStartHour = baseStart.getHours();
  const baseStartMinute = baseStart.getMinutes();
  const baseEndHour = baseEnd.getHours();
  const baseEndMinute = baseEnd.getMinutes();

  const startWindow = new Date(dt);
  startWindow.setHours(baseStartHour, baseStartMinute, 0, 0);

  const endWindow = new Date(dt);
  if (baseEnd.getTime() >= baseStart.getTime()) {
    endWindow.setHours(baseEndHour, baseEndMinute, 0, 0);
  } else {
    // crosses midnight
    endWindow.setDate(endWindow.getDate() + 1);
    endWindow.setHours(baseEndHour, baseEndMinute, 0, 0);
  }

  const t = dt.getTime();
  if (t < startWindow.getTime() || t > endWindow.getTime()) return schedule;

  return null;
}
