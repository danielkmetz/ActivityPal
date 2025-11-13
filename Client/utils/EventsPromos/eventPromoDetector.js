export const eventPromoDetector = (entity, postType) => {
  const t = String(postType || '').toLowerCase().trim();
  if (t === 'event' || t === 'events' || t === 'promotion' || t === 'promotions' || t === 'promo' || t === 'suggestion') {
    return true;
  }

  const label = String(
    entity?.kind || entity?.__typename || entity?.type || ''
  ).toLowerCase();

  // covers "Event", "Promotion", "Promo", and pluralized variants
  return (
    label === 'event' ||
    label === 'events' ||
    label === 'promotion' ||
    label === 'promotions' ||
    label.includes('promo')   // "promo", "promotion"
  );
};
