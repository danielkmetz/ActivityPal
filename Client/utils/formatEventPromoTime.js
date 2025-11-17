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
/* Your existing helper, rewritten to use toDate (same behavior)      */
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

/* ------------------------------------------------------------------ */
/* Updated helpers to mirror formatTimeTo12Hour                       */
/* ------------------------------------------------------------------ */

export const formatTime = (value) => {
  // Just reuse the robust helper
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

export const getTimeLabel = (item) => {
  if (!item) return null;
  if (item.allDay) return "Happening All Day";

  const kind = item.kind?.toLowerCase() || "";

  // 🌀 Recurring with days
  if (
    item.recurring &&
    Array.isArray(item.recurringDays) &&
    item.startTime &&
    item.endTime
  ) {
    const shortDays = item.recurringDays.map(getShortDay).join(", ");
    const start = formatTimeTo12Hour(item.startTime);
    const end = formatTimeTo12Hour(item.endTime);
    return `${shortDays} from ${start} - ${end}`;
  }

  // 🔵 Active
  if (kind.includes("active") && item.endTime) {
    return `Ends at ${formatTimeTo12Hour(item.endTime)}`;
  }

  // 🟡 Upcoming
  if (kind.includes("upcoming") && item.startTime) {
    return `Starts at ${formatTimeTo12Hour(item.startTime)}`;
  }

  // 🔴 Inactive
  if (kind.includes("inactive") && item.endTime) {
    // Assuming endTime is a real date/ISO here
    return `Ended on ${formatDate(item.endTime)} at ${formatTimeTo12Hour(
      item.endTime
    )}`;
  }

  return null;
};
