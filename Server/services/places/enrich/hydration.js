const { hydratePlacesWithPromosEvents, sortPlacesByPromoThenDistance } = require("../../../utils/PromosEvents/hydratePromosEvents");
const { sortPendingInPlace } = require("../filters/sort");
const { ensureArray } = require("../query/queryNormalization");
const { parseWhenAtISO } = require("../../../utils/places/timeHelpers");

async function hydrateAndSortPending(state) {
  const pending = ensureArray(state.pending);
  if (!pending.length) return state;

  const toHydrate = pending.filter((p) => !p?._peHydrated);
  if (toHydrate.length) {
    const targetAt = parseWhenAtISO(state.query?.whenAtISO) || new Date(state.targetAtISO || Date.now());

    const { hydrated } = await hydratePlacesWithPromosEvents({
      places: toHydrate,
      now: targetAt,
    });

    const byId = new Map(ensureArray(hydrated).map((p) => [p.place_id, p]));

    state.pending = pending.map((p) => {
      const h = byId.get(p.place_id);
      if (!h) return p;
      return {
        ...h,
        _peHydrated: true,
        openAtTarget: p.openAtTarget,
        whoScore: p.whoScore,
      };
    });
  }

  state.pending = sortPlacesByPromoThenDistance(ensureArray(state.pending));
  sortPendingInPlace(state.pending);

  return state;
}

module.exports = { hydrateAndSortPending };
