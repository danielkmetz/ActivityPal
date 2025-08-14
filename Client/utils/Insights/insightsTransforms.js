export const buildLineData = (series, activeMap, width, opts = {}) => {
  const { interval = 'day' } = opts;

  if (!series?.length) return null;
  const visible = series.filter(s => activeMap[s.name]);
  if (!visible.length) return { labels: [], datasets: [], legends: [], pointsCount: 0 };

  const first = visible[0].points || [];
  const count = first.length;

  const desiredTicks = Math.min(8, Math.max(4, Math.floor((width - 20) / 70)));
  const tickEvery = Math.max(1, Math.ceil(count / desiredTicks));

  const fmt = makeDateFormatter(interval);

  const labels = first.map((p, i) => {
    if (i % tickEvery === 0 || i === count - 1) return fmt(new Date(p.t));
    return '';
  });

  const datasets = visible.map(s => ({
    data: (s.points || []).map(p => p.value),
    strokeWidth: 2,
  }));

  const legends = visible.map(s => s.name);

  return { labels, datasets, legends, pointsCount: count, tickEvery };
};

// ✅ FIXED: `d` now lives inside the returned function
function makeDateFormatter(interval) {
  if (interval === 'day') {
    return (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (interval === 'week') {
    return (d) => {
      const wk = getISOWeek(d);
      return `W${wk} ${d.getFullYear()}`;
    };
  }
  // 'month' (default)
  return (d) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// ISO week number (1–53)
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d - firstThursday;
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

// utils/Insights/insightsTransforms.js
export const buildPieData = (rawTotals, nameFor, colorFor) => {
  if (!rawTotals) return []; // <— never null

  // Normalize to [ [rawName, value], ... ]
  let entries = [];
  if (Array.isArray(rawTotals)) {
    entries = rawTotals
      .map(t => [t.name ?? t.type ?? 'unknown', Number(t.value ?? t.count ?? 0)])
      .filter(([, v]) => v > 0);
  } else if (typeof rawTotals === 'object') {
    entries = Object.entries(rawTotals)
      .map(([k, v]) => [k, Number(v ?? 0)])
      .filter(([, v]) => v > 0);
  }

  if (!entries.length) return []; // <— still array, just empty

  return entries.map(([rawName, count]) => ({
    name: nameFor(rawName),
    count,
    color: colorFor(rawName),
    legendFontColor: '#7F7F7F',
    legendFontSize: 15,
  }));
};
