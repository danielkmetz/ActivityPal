function promoCount(p) {
  const promos = Array.isArray(p?.promotions) ? p.promotions.length : 0;
  const events = Array.isArray(p?.events) ? p.events.length : 0;
  return promos + events;
}

function sortPendingInPlace(list) {
  list.sort((a, b) => {
    const ao = a.openAtTarget === true ? 0 : a.openAtTarget === false ? 2 : 1;
    const bo = b.openAtTarget === true ? 0 : b.openAtTarget === false ? 2 : 1;
    if (ao !== bo) return ao - bo;

    const ap = promoCount(a);
    const bp = promoCount(b);
    if (ap !== bp) return bp - ap;

    const as = Number(a.whoScore || 0);
    const bs = Number(b.whoScore || 0);
    if (as !== bs) return bs - as;

    if (a.distance !== b.distance) return a.distance - b.distance;
    return String(a.place_id).localeCompare(String(b.place_id));
  });
}

module.exports = { promoCount, sortPendingInPlace };
