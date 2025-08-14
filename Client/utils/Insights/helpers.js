import React from "react";

export const SERIES_COLORS = {
  view: '#3B82F6',
  click: '#10B981',
  join: '#F59E0B',
  default: '#6B7280',
};

export const MS_DAY = 24 * 60 * 60 * 1000;

export const typeFromName = (seriesName = '') =>
  String(seriesName).split('—')[0].trim().toLowerCase();

export const prettySeriesLabel = (rawName = '') =>
  String(rawName).split('—')[0].trim();

export const colorFor = (seriesName = '') =>
  SERIES_COLORS[typeFromName(seriesName)] || SERIES_COLORS.default;

export const clampIntervalsForRange = (start, end) => {
  if (!start || !end) return ['day']; // block daily for "All"
  const days = Math.max(1, Math.ceil((end - start) / MS_DAY) + 1);
  if (days < 14) return ['week', 'month'];
  if (days < 60) return ['month'];
  return [];
};

export const useStableCsv = (arr) =>
  React.useMemo(() => (arr && arr.length ? arr.join(',') : ''), [arr]);
