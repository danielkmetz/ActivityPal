export const normalizeActivityType = (t = '') => {
  const s = String(t).toLowerCase();
  if (s.includes('event')) return 'event';
  if (s.includes('events')) return 'event';
  if (s.includes('promo')) return 'promotion';
  if (s.includes('promos')) return 'promotion';
  if (s.includes('promotion')) return 'promotion';
  if (s.includes('promotions')) return 'promotion';
  return null; // unknown → forces safe path
};