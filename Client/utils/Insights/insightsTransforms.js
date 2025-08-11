export const buildLineData = (series, activeMap, width) => {
  if (!series?.length) return null;
  const filtered = series.filter(s => activeMap[s.name]);
  if (!filtered.length) return { labels: [], datasets: [], legends: [], pointsCount: 0 };
  const first = filtered[0].points || [];
  const count = first.length;
  const desired = Math.min(8, Math.max(4, Math.floor((width - 20) / 70)));
  const every = Math.max(1, Math.ceil(count / desired));
  const labels = first.map((p, i) => (i % every === 0 || i === count - 1) ? new Date(p.t).toLocaleDateString() : '');
  const datasets = filtered.map(s => ({ data: (s.points || []).map(p => p.value), strokeWidth: 2 }));
  const legends = filtered.map(s => s.name);
  return { labels, datasets, legends, pointsCount: count, tickEvery: every };
};

export const buildPieData = (totals, nameFor, palette) => {
  if (!totals) return [];
  const entries = Object.entries(totals).filter(([, v]) => v > 0);
  if (!entries.length) {
    return [{ name: 'No data', count: 1, color: 'rgba(200,200,200,0.6)', legendFontColor: '#7F7F7F', legendFontSize: 15 }];
  }
  return entries.map(([rawName, count], i) => ({
    name: nameFor(rawName),
    count,
    color: palette[i % palette.length],
    legendFontColor: '#7F7F7F',
    legendFontSize: 15,
  }));
};
