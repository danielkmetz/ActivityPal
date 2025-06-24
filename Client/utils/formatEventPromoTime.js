const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
    });
};

export const getTimeLabel = (item) => {
    if (item?.allDay) return 'Happening All Day';

    if (item?.kind === 'activePromo' || item?.kind === 'activeEvent') {
        return item?.endTime ? `Ends at ${formatTime(item.endTime)}` : null;
    }

    if (item?.kind === 'upcomingPromo' || item?.kind === 'upcomingEvent') {
        return item?.startTime ? `Starts at ${formatTime(item.startTime)}` : null;
    }

    return null;
};

