const { hydratePlacesWithPromosEvents, sortPlacesByPromoThenDistance } =
  require("../../../utils/PromosEvents/hydratePromosEvents");

function ensureArray(v) { return Array.isArray(v) ? v : []; }

function promoCount(p) {
  const promos = Array.isArray(p?.promotions) ? p.promotions.length : 0;
  const events = Array.isArray(p?.events) ? p.events.length : 0;
  return promos + events;
}

function countPromoHits(list) {
  return (Array.isArray(list) ? list : []).reduce((n, p) => n + (promoCount(p) > 0 ? 1 : 0), 0);
}

async function hydrateAndSortPending(state, log) {
  const pending = Array.isArray(state.pending) ? state.pending : [];
  if (!pending.length) return state;

  const toHydrate = pending.filter((p) => !p?._peHydrated);
  if (toHydrate.length) {
    const now = new Date();
    const { hydrated } = await hydratePlacesWithPromosEvents({ places: toHydrate, now });
    const hydratedList = Array.isArray(hydrated) ? hydrated : [];

    const byId = new Map(
      hydratedList
        .filter((x) => x?.place_id)
        .map((x) => [x.place_id, { ...x, promotions: ensureArray(x.promotions), events: ensureArray(x.events), _peHydrated: true }])
    );

    state.pending = pending.map((p) => byId.get(p.place_id) || p);
  }

  state.pending = sortPlacesByPromoThenDistance(state.pending);
  return state;
}

async function fillHydrateSortWithPromoSeek({ state, fillPending, want, apiKey, log, diag, parseDiningMode }) {
  const MIN_PROMO_HITS = 2;
  const EXTRA_PER_SEEK = 20;
  const MAX_SEEKS = 2;

  let target = want;

  for (let attempt = 0; attempt <= MAX_SEEKS; attempt++) {
    state = await fillPending(state, target, { apiKey, log, diag, parseDiningMode });
    state = await hydrateAndSortPending(state, log);

    const hits = countPromoHits(state.pending);
    const canFetchMore = (diag?.fetch?.googleCalls || 0) < 6; // keep aligned with constants in caller if you prefer

    if (hits >= MIN_PROMO_HITS || !canFetchMore) break;
    target += EXTRA_PER_SEEK;
  }

  return state;
}

module.exports = { hydrateAndSortPending, fillHydrateSortWithPromoSeek, sortPlacesByPromoThenDistance };
