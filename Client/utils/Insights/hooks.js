import { useState, useMemo, useEffect, useCallback } from 'react';
import { toIsoDateString, computeRange } from './dateRanges';
import { clampIntervalsForRange } from './helpers';

export function useDateRangeState(dateRange) {
  return useMemo(() => {
    if (dateRange.preset === 'custom' && dateRange.startDate && dateRange.endDate) {
      const startDateISO = toIsoDateString(dateRange.startDate);
      const endDateISO = toIsoDateString(dateRange.endDate);
      return {
        startDateISO,
        endDateISO,
        startObj: new Date(dateRange.startDate),
        endObj: new Date(dateRange.endDate),
      };
    }
    const { start, end } = computeRange(dateRange.preset);
    return {
      startDateISO: start ? toIsoDateString(start) : undefined,
      endDateISO: end ? toIsoDateString(end) : undefined,
      startObj: start || null,
      endObj: end || null,
    };
  }, [dateRange]);
}

export function useIntervalGuard(datePreset, startObj, endObj, interval, setInterval) {
  const disabled = useMemo(() => {
    if (datePreset === 'all') return ['day'];
    return clampIntervalsForRange(startObj, endObj);
  }, [datePreset, startObj, endObj]);

  useEffect(() => {
    if (disabled.includes(interval)) {
      const fallback = ['week', 'month', 'day'].find((k) => !disabled.includes(k)) || 'week';
      setInterval(fallback);
    }
  }, [disabled, interval, setInterval]);

  return disabled;
}

export function useActiveSeries(series) {
  const [activeMap, setActiveMap] = useState({});
  useEffect(() => {
    if (!Array.isArray(series) || !series.length) return;
    const next = {};
    for (const s of series) next[s.name] = true;
    setActiveMap(next);
  }, [series]);
  const toggle = useCallback((name) => {
    setActiveMap((m) => ({ ...m, [name]: !m[name] }));
  }, []);
  return [activeMap, toggle];
}
