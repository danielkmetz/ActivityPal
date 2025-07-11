const formatTime = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatDate = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const getShortDay = (day) => {
  // Map full day names to short versions
  const map = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun',
  };
  return map[day] || day;
};

export const getTimeLabel = (item) => {
  if (!item) return null;
  if (item.allDay) return 'Happening All Day';

  const kind = item.kind?.toLowerCase() || '';

  // 🌀 Recurring with days
  if (item.recurring && Array.isArray(item.recurringDays) && item.startTime && item.endTime) {
    const shortDays = item.recurringDays.map(getShortDay).join(', ');
    const start = formatTime(item.startTime);
    const end = formatTime(item.endTime);
    return `${shortDays} from ${start} - ${end}`;
  }

  // 🔵 Active
  if (kind.includes('active') && item.endTime) {
    return `Ends at ${formatTime(item.endTime)}`;
  }

  // 🟡 Upcoming
  if (kind.includes('upcoming') && item.startTime) {
    return `Starts at ${formatTime(item.startTime)}`;
  }

  // 🔴 Inactive
  if (kind.includes('inactive') && item.endTime) {
    return `Ended on ${formatDate(item.endTime)} at ${formatTime(item.endTime)}`;
  }

  return null;
};
