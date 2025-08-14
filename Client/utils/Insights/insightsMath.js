// 1) Sum points for any "view/click/join" series if totals are missing
const sumSeriesByName = (series = []) => {
  const acc = { views: 0, clicks: 0, joins: 0 };
  for (const s of series) {
    const name = (s?.name || '').toLowerCase();
    const sum = (s?.points || []).reduce((z, p) => z + (Number(p?.value ?? p?.v) || 0), 0);

    if (name.includes('view')) {
      acc.views += sum;
    } else if (name.includes('click')) {
      acc.clicks += sum;
    } else if (name.includes('join')) {
      acc.joins += sum;
    }
  }
  return acc;
};

// 2) Current totals: prefer insights.totals, fallback to summed series
export const getCurrentTotals = (insights) => {
  const t = insights?.totals;
  if (t) {
    if (t.view || t.click || t.join) {
      const current = { views: t.view || 0, clicks: t.click || 0, joins: t.join || 0 };
      return current;
    }
  }
  return sumSeriesByName(insights?.series);
};

// 3) Previous totals: support several backend shapes; default to zeros
export const getPreviousTotals = (insights) => {
  const p = insights?.prevTotals || insights?.previousTotals || null;
  if (!p) {
    console.log('[insightsMath] No previous totals found, defaulting to zeros');
    return { views: 0, clicks: 0, joins: 0 };
  }

  const previous = {
    views: p.view ?? p.views ?? 0,
    clicks: p.click ?? p.clicks ?? 0,
    joins: p.join ?? p.joins ?? 0,
  };
  return previous;
};

// 4) Convenience to get KPIs array in one shot
export const buildKpis = (current, previous) => {
  const kpis = [
    { key: 'views',  label: 'Total Views',  value: current.views,  prev: previous.views },
    { key: 'clicks', label: 'Total Clicks', value: current.clicks, prev: previous.clicks },
    { key: 'joins',  label: 'Total Joins',  value: current.joins,  prev: previous.joins },
  ];

  return kpis;
};

// 5) One-call helper if you prefer
export const computeKpis = (insights) => {
  const current = getCurrentTotals(insights);
  const previous = getPreviousTotals(insights);
  const kpis = buildKpis(current, previous);

  return { current, previous, kpis };
};
