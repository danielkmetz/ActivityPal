const { evaluatePlace } = require("../search/filters");
const { fetchNearbyPage } = require("../google/nearbyClient");
const { NEXT_TOKEN_WAIT_MS, MAX_GOOGLE_CALLS_PER_REQUEST, MAX_PAGES_PER_COMBO, MAX_SEEN_IDS } = require("./constants");
const { anyCombosRemaining } = require("./state");

async function fillPending(state, wantCount, { apiKey, log, diag, parseDiningMode }) {
  const combos = Array.isArray(state.combos) ? state.combos : [];
  const comboMeta = Array.isArray(state.comboMeta) ? state.comboMeta : [];

  state.seenIds = Array.isArray(state.seenIds) ? state.seenIds : [];
  state.pending = Array.isArray(state.pending) ? state.pending : [];
  const seenSet = new Set(state.seenIds);

  state._visitedCombos = Array.isArray(state._visitedCombos) ? state._visitedCombos : [];
  const visited = new Set(state._visitedCombos);

  while (
    (state.pending.length < wantCount || visited.size < combos.length) &&
    diag.fetch.googleCalls < MAX_GOOGLE_CALLS_PER_REQUEST
  ) {
    if (!combos.length) { diag.fetch.stoppedBecause = "noCombos"; break; }

    let picked = -1;
    for (let i = 0; i < combos.length; i++) {
      const idx = (state.comboIndex + i) % combos.length;
      if (!comboMeta[idx]?.exhausted) { picked = idx; break; }
    }
    if (picked === -1) { diag.fetch.stoppedBecause = "allExhausted"; break; }

    const combo = combos[picked] || {};
    const m = comboMeta[picked] || (comboMeta[picked] = {});
    visited.add(picked);
    state._visitedCombos = Array.from(visited);

    if ((m.pagesFetched || 0) >= MAX_PAGES_PER_COMBO) {
      m.exhausted = true;
      state.comboIndex = (picked + 1) % combos.length;
      continue;
    }

    const now = Date.now();
    if (m.nextPageToken && m.tokenReadyAt && now < m.tokenReadyAt) {
      state.comboIndex = (picked + 1) % combos.length;
      continue;
    }

    diag.fetch.googleCalls++;

    let data;
    try {
      data = await fetchNearbyPage({ state, combo, meta: m, apiKey });
    } catch (e) {
      m.exhausted = true;
      state.comboIndex = (picked + 1) % combos.length;
      continue;
    }

    const status = data?.status;
    if (status === "INVALID_REQUEST" && m.nextPageToken) {
      m.tokenReadyAt = Date.now() + NEXT_TOKEN_WAIT_MS;
      state.comboIndex = (picked + 1) % combos.length;
      continue;
    }
    if (status === "ZERO_RESULTS" || status !== "OK") {
      m.exhausted = true;
      state.comboIndex = (picked + 1) % combos.length;
      continue;
    }

    const results = Array.isArray(data?.results) ? data.results : [];
    diag.fetch.resultsSeen += results.length;

    for (const rawPlace of results) {
      const id = rawPlace?.place_id;
      if (!id) { diag.bump("missingId"); continue; }
      if (seenSet.has(id)) { diag.bump("dup"); continue; }

      const evalRes = evaluatePlace(rawPlace, state, { parseDiningMode });
      if (!evalRes.ok) {
        evalRes.reasons.forEach((r) => diag.bump(r));
        continue;
      }

      const distanceMiles = evalRes.distMeters / 1609.34;
      const openNow = typeof rawPlace?.opening_hours?.open_now === "boolean"
        ? rawPlace.opening_hours.open_now
        : null;

      state.pending.push({
        name: rawPlace?.name || null,
        types: Array.isArray(rawPlace?.types) ? rawPlace.types : [],
        address: rawPlace?.vicinity || null,
        place_id: id,
        openNow,
        photoUrl: null,
        photoName: rawPlace?.photos?.[0]?.photo_reference || null,
        distance: +distanceMiles.toFixed(2),
        location: { lat: evalRes.pLat, lng: evalRes.pLng },
        cuisine: "unknown",
        promotions: [],
        events: [],
        _peHydrated: false,
      });

      seenSet.add(id);
      state.seenIds.push(id);
      diag.bump("added");

      if (state.seenIds.length > MAX_SEEN_IDS) {
        const overflow = state.seenIds.length - MAX_SEEN_IDS;
        for (let k = 0; k < overflow; k++) {
          const old = state.seenIds.shift();
          if (old) seenSet.delete(old);
        }
      }

      if (state.pending.length >= wantCount && visited.size >= combos.length) break;
    }

    m.pagesFetched = (m.pagesFetched || 0) + 1;
    diag.fetch.pagesFetchedTotal += 1;

    const next = data?.next_page_token || null;
    if (next) {
      m.nextPageToken = next;
      m.tokenReadyAt = Date.now() + NEXT_TOKEN_WAIT_MS;
    } else {
      m.nextPageToken = null;
      m.tokenReadyAt = 0;
      m.exhausted = true;
    }

    state.comboIndex = (picked + 1) % combos.length;
    if (state.pending.length >= wantCount && visited.size >= combos.length) {
      diag.fetch.stoppedBecause = "wantCount";
      break;
    }
  }

  if (!diag.fetch.stoppedBecause && diag.fetch.googleCalls >= MAX_GOOGLE_CALLS_PER_REQUEST) {
    diag.fetch.stoppedBecause = "callCap";
  } else if (!diag.fetch.stoppedBecause && combos.length && !anyCombosRemaining(state)) {
    diag.fetch.stoppedBecause = "allExhausted";
  }

  state.updatedAtISO = new Date().toISOString();
  return state;
}

module.exports = { fillPending };
