const { evaluatePlace } = require("../search/filters");
const { fetchNearbyPage } = require("../google/nearbyClient");
const {
  NEXT_TOKEN_WAIT_MS,
  MAX_GOOGLE_CALLS_PER_REQUEST,
  MAX_PAGES_PER_COMBO,
  MAX_SEEN_IDS,
} = require("./constants");
const { anyCombosRemaining } = require("./state");

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function ensureComboMeta(state) {
  state.combos = ensureArray(state.combos);

  const meta = ensureArray(state.comboMeta);
  if (meta.length !== state.combos.length) {
    state.comboMeta = state.combos.map(() => ({
      pagesFetched: 0,
      nextPageToken: null,
      tokenReadyAt: 0,
      exhausted: false,
    }));
    return;
  }

  state.comboMeta = meta.map((m) => ({
    pagesFetched: Number(m?.pagesFetched || 0),
    nextPageToken: m?.nextPageToken || null,
    tokenReadyAt: Number(m?.tokenReadyAt || 0),
    exhausted: !!m?.exhausted,
  }));
}

function pickNextCombo({ combos, comboMeta, startIndex, visitedThisCall }) {
  if (!combos.length) return -1;

  for (let i = 0; i < combos.length; i++) {
    const idx = (startIndex + i) % combos.length;
    if (comboMeta[idx]?.exhausted) continue;
    if (visitedThisCall.has(idx)) continue;
    return idx;
  }

  for (let i = 0; i < combos.length; i++) {
    const idx = (startIndex + i) % combos.length;
    if (!comboMeta[idx]?.exhausted) return idx;
  }

  return -1;
}

async function fillPending(state, wantCount, { apiKey, diag, parseDiningMode }) {
  state.seenIds = ensureArray(state.seenIds);
  state.pending = ensureArray(state.pending);
  state.comboIndex = Number(state.comboIndex || 0);
  state.query = state.query && typeof state.query === "object" ? state.query : null;

  ensureComboMeta(state);

  const combos = state.combos;
  const comboMeta = state.comboMeta;

  const seenSet = new Set(state.seenIds);
  const visitedThisCall = new Set();

  while (
    state.pending.length < wantCount &&
    diag.fetch.googleCalls < MAX_GOOGLE_CALLS_PER_REQUEST
  ) {
    if (!combos.length) {
      diag.fetch.stoppedBecause = "noCombos";
      break;
    }

    const picked = pickNextCombo({
      combos,
      comboMeta,
      startIndex: state.comboIndex,
      visitedThisCall,
    });

    if (picked === -1) {
      diag.fetch.stoppedBecause = "allExhausted";
      break;
    }

    const combo = combos[picked] || {};
    const m = comboMeta[picked] || (comboMeta[picked] = {});
    visitedThisCall.add(picked);

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
      data = await fetchNearbyPage({
        state,
        combo,
        meta: m,
        apiKey,
        query: state.query,
      });
    } catch {
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

    const results = ensureArray(data?.results);
    diag.fetch.resultsSeen += results.length;

    for (const rawPlace of results) {
      if (state.pending.length >= wantCount) break;

      const id = rawPlace?.place_id;
      if (!id) {
        diag.bump("missingId");
        continue;
      }
      if (seenSet.has(id)) {
        diag.bump("dup");
        continue;
      }

      const evalRes = evaluatePlace(rawPlace, state, {
        parseDiningMode,
        query: state.query,
      });

      if (!evalRes.ok) {
        evalRes.reasons.forEach((r) => diag.bump(r));
        continue;
      }

      const distanceMiles = evalRes.distMeters / 1609.34;
      const openNow =
        typeof rawPlace?.opening_hours?.open_now === "boolean"
          ? rawPlace.opening_hours.open_now
          : null;

      state.pending.push({
        name: rawPlace?.name || null,
        types: ensureArray(rawPlace?.types),
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
