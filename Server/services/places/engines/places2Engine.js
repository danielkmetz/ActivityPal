const crypto = require("crypto");
const { buildNewSearchState } = require("../stateFactory");
const { hydrateAndSortPending } = require("../enrich/hydration");
const { fillPending, prefetchAllResults, PREFETCH_BUFFER, PREFETCH_ALL_DEFAULT } = require("../engine");
const { auditPush, pickIds } = require("../cursorStore/audit");

function newCursorId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
}

function makeLogger({ debug, reqId }) {
  if (!debug) return null;
  return (msg, obj) => {
    console.log(obj === undefined ? `[places2][${reqId}] ${msg}` : `[places2][${reqId}] ${msg}`, obj);
  };
}

// Truth lives in stream meta: nearby = fetched/exhausted, text = nextPageToken/exhausted
function anyRemaining(state) {
  const streams = Array.isArray(state?.combos) ? state.combos : [];
  const meta = Array.isArray(state?.comboMeta) ? state.comboMeta : [];

  for (let i = 0; i < streams.length; i++) {
    const s = streams[i];
    const m = meta[i] || null;
    if (!s || !m) continue;

    if (s.kind === "nearby") {
      if (!m.fetched && !m.exhausted) return true;
      continue;
    }

    if (s.kind === "text") {
      if (!m.exhausted) return true;
      continue;
    }
  }

  return false;
}

// Places v1 nearby/text doesn’t require token-ready delays (legacy behavior)
// Keep for compatibility with your runner.
function nextReadyAtMs() {
  return null;
}

async function buildNewState({ query, now, cursorId, perPageNum, reqId, ctx }) {
  const badLatLng =
    !Number.isFinite(query?.lat) || !Number.isFinite(query?.lng)
      ? { status: 400, message: "Invalid normalized query: lat/lng" }
      : null;

  const badRadius =
    !Number.isFinite(query?.radiusMeters)
      ? { status: 400, message: "Invalid normalized query: radiusMeters" }
      : null;

  if (badLatLng) return { error: badLatLng };
  if (badRadius) return { error: badRadius };

  const built = buildNewSearchState({
    q: query,
    now,
    latNum: query.lat,
    lngNum: query.lng,
    rNum: query.radiusMeters,
    perPageNum,
    cursorId,
  });

  if (built.error) return { error: built.error };

  const state = built.state;

  auditPush(state, {
    t: Date.now(),
    kind: "create",
    reqId: reqId || null,
    cursor: state.cursorId,
    queryHash: state.queryHash ? String(state.queryHash).slice(0, 12) : null,
  });

  return { state };
}

async function fillHydrateSort({ state, apiKey, want, qIn }) {
  const prefetchAll = typeof qIn.prefetchAll === "boolean" ? qIn.prefetchAll : PREFETCH_ALL_DEFAULT;

  if (prefetchAll) {
    await prefetchAllResults({ state, apiKey });
  } else {
    await fillPending({ state, apiKey, wantCount: want });
    await hydrateAndSortPending(state);
  }

  return { state };
}

function debugMeta({ state }) {
  return {
    totals: state?.totals || null,
    auditLen: Array.isArray(state?.audit) ? state.audit.length : 0,
    pendingHead: pickIds(state?.pending, 3),
    fallbackArmed: !!state?.fallbackArmed,
    streams: Array.isArray(state?.combos)
      ? state.combos.slice(0, 6).map((s) => ({
          kind: s.kind,
          stage: s.stage,
          includedTypes: s.includedTypes ? s.includedTypes.slice(0, 3) : null,
          textQuery: s.textQuery ? String(s.textQuery).slice(0, 40) : null,
        }))
      : [],
  };
}

module.exports = {
  provider: "places2",
  newCursorId,
  makeLogger,
  buildNewState,
  fillHydrateSort,
  anyRemaining,
  nextReadyAtMs,
  debugMeta,
};
