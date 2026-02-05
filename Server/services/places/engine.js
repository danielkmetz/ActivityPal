const { fetchPlacesTextV1 } = require("./v1/textSearchClient");
const { fetchNearbyPlacesV1 } = require("./v1/nearbySearchClient");
const { ensureArray } = require("./query/queryNormalization");
const { evaluateCandidatePlace } = require("./filters/placeFilters");
const { hydrateAndSortPending } = require("./enrich/hydration");
const { parseWhenAtISO } = require("../../utils/places/timeHelpers");

// ---- Engine tuning ----
const TOKEN_DELAY_MS = 1500;
const PREFETCH_BUFFER = 12;
const MAX_GOOGLE_CALLS_PER_REQUEST = 20;
const PREFETCH_ALL_DEFAULT = true;
const PREFETCH_ALL_CHUNK = 80;
const MAX_GOOGLE_CALLS_PER_SEARCH = 250;
const MAX_TOTAL_RESULTS = 600;
const MAX_TOKEN_WAIT_MS = 12000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getReqId(state) {
  return (
    (state && state.query && state.query.reqId) ||
    state?.reqId ||
    state?.cursorId ||
    "no-reqid"
  );
}

function anyStreamsRemaining(state) {
  for (const m of ensureArray(state.comboMeta)) {
    if (!m?.exhausted) return true;
  }
  return false;
}

function pickNextStreamIndex(state) {
  const combos = ensureArray(state.combos);
  const meta = ensureArray(state.comboMeta);
  if (!combos.length) return -1;

  const now = Date.now();
  let idx = Number(state.cursorIndex || 0) % combos.length;

  for (let tries = 0; tries < combos.length; tries++) {
    const m = meta[idx] || {};
    const exhausted = !!m.exhausted;
    const readyAt = typeof m.tokenReadyAtMs === "number" ? m.tokenReadyAtMs : 0;
    const tokenBlocked = m.nextPageToken && now < readyAt;

    if (!exhausted && !tokenBlocked) {
      state.cursorIndex = (idx + 1) % combos.length;
      return idx;
    }
    idx = (idx + 1) % combos.length;
  }
  return -1;
}

function nextTokenWaitMs(state) {
  const now = Date.now();
  let best = null;

  for (const m of ensureArray(state.comboMeta)) {
    if (!m) continue;
    const hasToken =
      typeof m.nextPageToken === "string" && m.nextPageToken.length;
    const readyAt = typeof m.tokenReadyAtMs === "number" ? m.tokenReadyAtMs : 0;
    if (hasToken && readyAt > now) {
      const d = readyAt - now;
      if (best == null || d < best) best = d;
    }
  }
  return best;
}

function getIncludedTypesFromStream(stream) {
  // Preferred: new stream shape
  if (Array.isArray(stream?.includedTypes)) {
    const arr = stream.includedTypes
      .filter((v) => typeof v === "string")
      .map((s) => s.trim())
      .filter((s) => s && s !== "undefined" && s !== "null");
    return arr.length ? arr : null;
  }

  // Back-compat: older stream shape
  if (typeof stream?.type === "string") {
    const t = stream.type.trim();
    return t ? [t] : null;
  }

  return null;
}

async function fillPending({
  state,
  apiKey,
  wantCount,
  maxCalls = MAX_GOOGLE_CALLS_PER_REQUEST,
} = {}) {
  state.pending = ensureArray(state.pending);
  state.seenIds = ensureArray(state.seenIds);
  state.comboMeta = ensureArray(state.comboMeta);

  const combos = ensureArray(state.combos);
  const seen = new Set(state.seenIds);

  const totals = state.totals || {
    googleCalls: 0,
    resultsSeen: 0,
    added: 0,
    dup: 0,
    excludedType: 0,
    excludedBudget: 0,
    guardrailReject: 0,
    filterReject: 0,
    dateNightReject: 0,
    mapReject: 0,
  };

  let callsThisFill = 0;

  const targetAt =
    parseWhenAtISO(state.query?.whenAtISO) ||
    new Date(state.targetAtISO || Date.now());
  const baseTimeCtx = state.timeCtx || { timeZone: null, tzOffsetMinutes: null };

  while (
    state.pending.length < wantCount &&
    callsThisFill < maxCalls &&
    anyStreamsRemaining(state)
  ) {
    const idx = pickNextStreamIndex(state);
    if (idx < 0) break;

    const stream = combos[idx];
    const meta = state.comboMeta[idx] || (state.comboMeta[idx] = {});

    const pageToken =
      typeof meta.nextPageToken === "string" && meta.nextPageToken.length
        ? meta.nextPageToken
        : null;

    callsThisFill += 1;
    totals.googleCalls = (totals.googleCalls || 0) + 1;

    let places = [];
    let nextPageToken = null;

    try {
      if (stream.kind === "text") {
        const res = await fetchPlacesTextV1({
          apiKey,
          textQuery: stream.textQuery,
          lat: state.originLat,
          lng: state.originLng,
          radiusMeters: state.radiusMeters,
          maxResultCount: 20,
          pageToken,
          when: state.query?.when,
          who: state.query?.who,
          debug: !!state.query?.debug,
          reqId: getReqId(state),
        });

        if (!res || typeof res !== "object" || !Array.isArray(res.places)) {
          throw new Error(
            "fetchPlacesTextV1 must return { places: [], nextPageToken }"
          );
        }

        places = res.places;
        nextPageToken =
          typeof res.nextPageToken === "string" && res.nextPageToken.length
            ? res.nextPageToken
            : null;
      } else {
        const included = getIncludedTypesFromStream(stream);

        if (!included) {
          meta.exhausted = true;

          const reqId = getReqId(state);
          console.warn(`[places2][${reqId}] nearby stream missing includedTypes`, {
            idx,
            stream: {
              kind: stream?.kind,
              stage: stream?.stage,
              type: stream?.type,
              includedTypes: stream?.includedTypes,
            },
          });

          continue;
        }

        const TYPE_RE = /^[a-z_]+$/;
        const bad = included.filter((t) => !TYPE_RE.test(t));
        if (bad.length) {
          meta.exhausted = true;

          const reqId = getReqId(state);
          console.warn(`[places2][${reqId}] invalid includedTypes for nearby`, {
            idx,
            bad,
            included,
            stream: {
              kind: stream?.kind,
              stage: stream?.stage,
            },
          });

          continue;
        }

        const res = await fetchNearbyPlacesV1({
          apiKey,
          lat: state.originLat,
          lng: state.originLng,
          radiusMeters: state.radiusMeters,
          includedTypes: included,
          excludedTypes: state.excludedTypes,
          rankPreference: state.rankPreference,
          when: state.query?.when,
          who: state.whoNorm,
          debug: !!state.query?.debug,
          reqId: getReqId(state),
        });

        if (!res || typeof res !== "object" || !Array.isArray(res.places)) {
          throw new Error(
            "fetchNearbyPlacesV1 must return { places: [], nextPageToken }"
          );
        }

        places = res.places;
        nextPageToken =
          typeof res.nextPageToken === "string" && res.nextPageToken.length
            ? res.nextPageToken
            : null;
      }
    } catch (err) {
      const reqId = getReqId(state);

      console.warn(`[places2][${reqId}] google call failed`, {
        idx,
        kind: stream?.kind,
        stage: stream?.stage,
        message: err?.message,
        normalized: err?.normalized || null,
      });

      // token behavior only matters for text paging; nearby is single-shot
      if (stream.kind === "text") {
        if (pageToken) meta.tokenReadyAtMs = Date.now() + TOKEN_DELAY_MS;
        else meta.exhausted = true;
      } else {
        meta.exhausted = true;
      }

      continue;
    }

    if (nextPageToken) {
      meta.nextPageToken = nextPageToken;
      meta.tokenReadyAtMs = Date.now() + TOKEN_DELAY_MS;
    } else {
      meta.nextPageToken = null;
      meta.exhausted = true;
    }

    for (const place of places) {
      totals.resultsSeen += 1;

      const id = place?.id;
      if (!id) continue;

      if (seen.has(id)) {
        totals.dup += 1;
        continue;
      }

      const evalRes = evaluateCandidatePlace({
        place,
        state,
        targetAt,
        baseTimeCtx,
      });

      if (!evalRes.ok) {
        if (evalRes.reason === "excludedType") totals.excludedType += 1;
        else if (evalRes.reason === "excludedBudget") totals.excludedBudget += 1;
        else if (evalRes.reason === "whoGuardrailReject")
          totals.guardrailReject += 1;
        else if (evalRes.reason === "placesFiltersReject")
          totals.filterReject += 1;
        else if (evalRes.reason === "dateNightReject") totals.dateNightReject += 1;
        else totals.mapReject += 1;
        continue;
      }

      seen.add(id);
      totals.added += 1;
      state.pending.push(evalRes.mapped);

      if (state.pending.length >= wantCount) break;
      if (state.pending.length >= MAX_TOTAL_RESULTS) break;
    }

    if (state.pending.length >= MAX_TOTAL_RESULTS) break;

    state.seenIds =
      seen.size > 6000 ? Array.from(seen).slice(-5000) : Array.from(seen);
  }

  state.totals = totals;
  return state;
}

async function prefetchAllResults({ state, apiKey } = {}) {
  const startedAt = Date.now();

  while (anyStreamsRemaining(state) && state.pending.length < MAX_TOTAL_RESULTS) {
    const totals = state.totals || {};
    const totalCallsSoFar = Number(totals.googleCalls || 0);
    if (totalCallsSoFar >= MAX_GOOGLE_CALLS_PER_SEARCH) break;

    const beforeLen = state.pending.length;
    const want = Math.min(MAX_TOTAL_RESULTS, beforeLen + PREFETCH_ALL_CHUNK);

    await fillPending({
      state,
      apiKey,
      wantCount: want,
      maxCalls: MAX_GOOGLE_CALLS_PER_REQUEST,
    });

    const afterLen = state.pending.length;

    if (afterLen === beforeLen && anyStreamsRemaining(state)) {
      const waited = Date.now() - startedAt;
      const delay = nextTokenWaitMs(state);

      if (delay != null && delay > 0 && waited < MAX_TOKEN_WAIT_MS) {
        const ms = Math.min(delay + 25, 2000);
        await sleep(ms);
        continue;
      }

      break;
    }
  }

  await hydrateAndSortPending(state);
  return state;
}

module.exports = {
  fillPending,
  prefetchAllResults,

  // exported for controller config/behavior
  PREFETCH_BUFFER,
  PREFETCH_ALL_DEFAULT,
};
