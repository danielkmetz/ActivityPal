// 🔧 Shared parser for Date | ISO string | "HH:mm"
const toDate = (value, { timeOnly = false } = {}) => {
  if (!value) return null;

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    // If looks like a full date/ISO, let Date parse it
    if (value.includes("T") || value.includes("-") || value.includes("/")) {
      date = new Date(value);
    } else if (timeOnly) {
      // "HH:mm" or "H:mm" -> use today's date + that time
      const [hourStr, minuteStr = "0"] = value.split(":");
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minuteStr, 10);

      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

      date = new Date();
      date.setHours(hour, minute, 0, 0);
    } else {
      // Not a recognizable date string and we don't want to treat it as time-only
      return null;
    }
  } else {
    return null;
  }

  if (Number.isNaN(date.getTime())) return null;
  return date;
};

/* ------------------------------------------------------------------ */
/* Existing helpers                                                   */
/* ------------------------------------------------------------------ */

export const formatTimeTo12Hour = (value) => {
  const date = toDate(value, { timeOnly: true });
  if (!date) return "";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

export const formatTime = (value) => {
  return formatTimeTo12Hour(value);
};

export const formatDate = (value) => {
  const date = toDate(value, { timeOnly: false });
  if (!date) return "";

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const getShortDay = (day) => {
  const map = {
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
    Sunday: "Sun",
  };
  return map[day] || day;
};

/* ------------------------------------------------------------------ */
/* NEW: normalize fields from top-level OR details                    */
/* ------------------------------------------------------------------ */

const resolveRecurringMeta = (item = {}) => {
  const d = item.details || {};

  const recurring =
    typeof item.recurring === "boolean"
      ? item.recurring
      : (typeof d.recurring === "boolean" ? d.recurring : false);

  const recurringDays = Array.isArray(item.recurringDays)
    ? item.recurringDays
    : (Array.isArray(d.recurringDays) ? d.recurringDays : []);

  const allDay =
    typeof item.allDay === "boolean"
      ? item.allDay
      : (typeof d.allDay === "boolean" ? d.allDay : false);

  // Prefer explicit startTime/endTime first, then startsAt/endsAt, then details.*
  const startTime =
    item.startTime ??
    item.startsAt ??
    d.startTime ??
    d.startsAt ??
    null;

  const endTime =
    item.endTime ??
    item.endsAt ??
    d.endTime ??
    d.endsAt ??
    null;

  const kind = (item.kind || "").toLowerCase();

  return { recurring, recurringDays, allDay, startTime, endTime, kind };
};

/* ------------------------------------------------------------------ */
/* Updated getTimeLabel                                               */
/* ------------------------------------------------------------------ */

export const getTimeLabel = (item) => {
  if (!item) return null;

  const { recurring, recurringDays, allDay, startTime, endTime, kind } =
    resolveRecurringMeta(item);

  if (allDay) return "Happening All Day";

  // 🌀 Recurring with days
  if (
    recurring &&
    Array.isArray(recurringDays) &&
    recurringDays.length &&
    startTime &&
    endTime
  ) {
    const shortDays = recurringDays.map(getShortDay).join(", ");
    const start = formatTimeTo12Hour(startTime);
    const end = formatTimeTo12Hour(endTime);
    return `${shortDays} from ${start} - ${end}`;
  }

  // 🔵 Active
  if (kind.includes("active") && endTime) {
    return `Ends at ${formatTimeTo12Hour(endTime)}`;
  }

  // 🟡 Upcoming
  if (kind.includes("upcoming") && startTime) {
    return `Starts at ${formatTimeTo12Hour(startTime)}`;
  }

  // 🔴 Inactive
  if (kind.includes("inactive") && endTime) {
    return `Ended on ${formatDate(endTime)} at ${formatTimeTo12Hour(endTime)}`;
  }

  return null;
};
