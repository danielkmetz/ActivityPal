const { normalizePlacesRequest } = require("../query/query");
const { MIN_PER_PAGE, MAX_PER_PAGE, PREFETCH_BUFFER } = require("./constants");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return '"[unserializable]"';
  }
}

function summarizeNorm(norm) {
  if (!norm) return { norm: null };

  const q = norm.qIn || {};
  const v = norm.value || {};

  return {
    ok: !!norm.ok,
    kind: norm.kind || null,
    // paging
    cursor: v.cursor ? "[present]" : null,
    perPage: v.perPage ?? null,
    hasQueryHash: typeof v.queryHash === "string" && v.queryHash.length > 0,
    debugFlag: v.debug === true,
    // selectors
    hasQuickFilter: typeof q.quickFilter !== "undefined" || typeof v.quickFilter !== "undefined",
    quickFilter: q.quickFilter ?? v.quickFilter ?? null,
    activityType: q.activityType ?? v.activityType ?? null,
    placeCategory: q.placeCategory ?? v.placeCategory ?? null,
    keyword: q.keyword ?? v.keyword ?? null,
    // a few common issues
    bodyHasQueryWrapper: !!(q && typeof q === "object" && q !== null && norm.qIn === q && !!norm.qIn && !!norm.qIn.cursor),
  };
}

function summarizeState(state) {
  if (!state) return { state: null };

  const pendingLen = Array.isArray(state.pending) ? state.pending.length : 0;
  const combosLen = Array.isArray(state.combos) ? state.combos.length : 0;

  const comboMeta = Array.isArray(state.comboMeta) ? state.comboMeta : [];
  const exhaustedCount = comboMeta.filter((m) => m && m.exhausted).length;

  return {
    cursorId: state.cursorId || null,
    provider: state.provider || null,
    queryHash: typeof state.queryHash === "string" ? `${state.queryHash.slice(0, 12)}…` : null,
    pageNo: state.pageNo ?? null,
    version: state.version ?? state.v ?? null,
    pendingLen,
    combosLen,
    exhaustedCount,
    // shallow query snapshot (don’t dump full filters)
    query: state.query
      ? {
          activityType: state.query.activityType ?? null,
          quickFilter: state.query.quickFilter ?? null,
          placeCategory: state.query.placeCategory ?? null,
          keyword: state.query.keyword ?? null,
          diningMode: state.query.diningMode ?? null,
        }
      : null,
    hasFallbackArmed: typeof state.fallbackArmed === "boolean" ? state.fallbackArmed : undefined,
  };
}

async function runPaginatedSearch({
  body,
  apiKey,
  cursorStore,
  useRedis,
  engine,
  now = new Date(),
  reqId = null,
  debugEnv = false,
}) {
  const t0 = Date.now();

  const debugFromBody =
    body &&
    typeof body === "object" &&
    (body.debug === true || (body.query && body.query.debug === true));

  const debug = !!(debugEnv || debugFromBody);

  const log = (msg, obj) => {
    if (!debug) return;
    const line = obj === undefined ? msg : `${msg} ${safeJson(obj)}`;
    console.log(`[places][runPaginatedSearch][${reqId || "no-reqid"}] ${line}`);
  };

  // --- API key guard ---
  if (!(typeof apiKey === "string" && apiKey.length > 10)) {
    log("missing apiKey", { hasKey: !!apiKey, len: apiKey ? String(apiKey).length : 0 });
    return { error: { status: 500, message: "Server misconfigured (Google API key missing)." } };
  }

  log("start", {
    storage: useRedis ? "redis" : "memory",
    engine: engine?.provider || null,
    bodyKeys: body && typeof body === "object" ? Object.keys(body).slice(0, 30) : null,
    hasQueryWrapper: !!(body && body.query && typeof body.query === "object"),
  });

  // --- normalize ---
  const norm = normalizePlacesRequest(body, {
    strictWrapper: false,
    perPageOpts: { MIN_PER_PAGE, MAX_PER_PAGE, fallback: 15 },
  });

  log("normalized", summarizeNorm(norm));

  if (!norm?.ok) {
    log("normalize failed", { status: norm?.status || 400, error: norm?.error || "Invalid request" });
    return { error: { status: norm?.status || 400, message: norm?.error || "Invalid request" } };
  }

  const qIn = norm.qIn || {};
  const perPageNum = norm.value.perPage;
  const incomingHash = typeof norm.value.queryHash === "string" ? norm.value.queryHash : null;

  // engine logger/ctx wiring (keep your behavior, but add our log)
  const engineLog = engine.makeLogger ? engine.makeLogger({ debug, reqId }) : null;
  const ctx = { debug, reqId, t0, log: engineLog };

  if (engine.initCtx) {
    log("engine.initCtx begin");
    await engine.initCtx(ctx);
    log("engine.initCtx done");
  }

  let cursorId = norm.kind === "cursor" ? norm.value.cursor : null;
  let state;

  if (cursorId) {
    // ---- continuation ----
    log("continuation begin", { cursor: "[present]" });

    state = await cursorStore.get(cursorId);
    if (!state) {
      log("cursor miss", { cursor: cursorId });
      return { error: { status: 400, message: "Invalid or expired cursor. Start a new search." } };
    }

    log("cursor loaded", summarizeState(state));

    if (incomingHash && state.queryHash && incomingHash !== state.queryHash) {
      log("immutability violation", {
        incoming: `${incomingHash.slice(0, 12)}…`,
        existing: `${String(state.queryHash).slice(0, 12)}…`,
      });
      return { error: { status: 400, message: "Query changed. Start a new search (reset cursor)." } };
    }

    if (engine.enforceContinuationConstraints) {
      const bad = engine.enforceContinuationConstraints({ state, qIn, ctx });
      if (bad) {
        log("engine continuation constraints failed", bad);
        return { error: bad };
      }
    }

    log("continuation ok");
  } else {
    // ---- new search ----
    log("new search begin");

    const query = norm.value;
    cursorId = engine.newCursorId();

    const built = await engine.buildNewState({
      query,
      now,
      cursorId,
      perPageNum,
      reqId,
      qIn,
      ctx,
    });

    if (built?.error) {
      log("engine.buildNewState error", built.error);
      return { error: built.error };
    }

    state = built.state;
    log("engine.buildNewState ok", summarizeState(state));

    if (!state || !(typeof state.queryHash === "string" && state.queryHash.length)) {
      log("FATAL: missing state.queryHash", {
        stateKeys: state && typeof state === "object" ? Object.keys(state).slice(0, 40) : null,
      });
      return { error: { status: 500, message: "Engine bug: state.queryHash missing on new search." } };
    }

    await cursorStore.set(cursorId, state);
    log("cursor stored (new)", { cursor: "[present]" });
  }

  const want = perPageNum + PREFETCH_BUFFER;
  log("fillHydrateSort begin", { want, perPage: perPageNum });

  const filled = await engine.fillHydrateSort({
    state,
    apiKey,
    now,
    want,
    qIn,
    perPageNum,
    reqId,
    ctx,
  });

  if (filled?.error) {
    log("fillHydrateSort error", filled.error);
    return { error: filled.error };
  }

  state = filled.state || state;
  log("fillHydrateSort done", summarizeState(state));

  let pendingLen = Array.isArray(state?.pending) ? state.pending.length : 0;
  let remaining = engine.anyRemaining ? engine.anyRemaining(state, ctx) : false;

  if (pendingLen === 0 && remaining && engine.nextReadyAtMs) {
    const nowMs = Date.now();
    const readyAt = engine.nextReadyAtMs(state, nowMs, ctx);
    const waitMs = readyAt && readyAt > nowMs ? readyAt - nowMs : 0;

    log("empty page guard", { pendingLen, remaining, waitMs });

    if (waitMs > 0 && waitMs <= 2000) {
      await sleep(waitMs);

      const refilled = await engine.fillHydrateSort({
        state,
        apiKey,
        now,
        want,
        qIn,
        perPageNum,
        reqId,
        ctx,
      });

      if (refilled?.error) {
        log("refill after wait error", refilled.error);
        return { error: refilled.error };
      }

      state = refilled.state || state;

      pendingLen = Array.isArray(state?.pending) ? state.pending.length : 0;
      remaining = engine.anyRemaining ? engine.anyRemaining(state, ctx) : false;

      log("refill after wait done", { pendingLen, remaining });
    }
  }

  if (pendingLen === 0 && !remaining) {
    await cursorStore.del(cursorId).catch(() => {});
    log("done: no results, cursor deleted", { elapsedMs: Date.now() - t0 });

    return {
      curatedPlaces: [],
      meta: {
        cursor: null,
        perPage: perPageNum,
        hasMore: false,
        elapsedMs: Date.now() - t0,
        provider: engine.provider || null,
        storage: useRedis ? "redis" : "memory",
        queryHash: state?.queryHash || null,
      },
    };
  }

  const beforeServeLen = Array.isArray(state.pending) ? state.pending.length : 0;
  const page = (Array.isArray(state.pending) ? state.pending : []).splice(0, perPageNum);

  state.pending = Array.isArray(state.pending) ? state.pending : [];

  state.version = Number(state.version || 0) + 1;
  state.pageNo = Number(state.pageNo || 0) + 1;
  state.lastServedAtISO = new Date().toISOString();
  state.lastServedReqId = reqId || null;
  state.updatedAtISO = new Date().toISOString();

  const pageOut = engine.postProcessPage
    ? await engine.postProcessPage({ page, state, now, qIn, perPageNum, ctx })
    : page;

  const hasMore =
    (Array.isArray(state.pending) && state.pending.length > 0) ||
    (engine.anyRemaining ? engine.anyRemaining(state, ctx) : false);

  if (hasMore) {
    await cursorStore.set(cursorId, state);
  } else {
    await cursorStore.del(cursorId).catch(() => {});
    cursorId = null;
  }

  const meta = {
    cursor: cursorId,
    perPage: perPageNum,
    hasMore,
    elapsedMs: Date.now() - t0,
    provider: engine.provider || null,
    storage: useRedis ? "redis" : "memory",
    queryHash: state?.queryHash || null,
    pageNo: state?.pageNo || null,
    version: state?.version || null,
    remainingBefore: beforeServeLen,
    remainingAfter: Array.isArray(state.pending) ? state.pending.length : 0,
  };

  if (debug && engine.debugMeta) {
    meta.debug = engine.debugMeta({ state, ctx });
  }

  if (engine.metaExtras) {
    Object.assign(meta, engine.metaExtras({ state, ctx }));
  }

  log("done", {
    curatedPlacesLen: Array.isArray(pageOut) ? pageOut.length : null,
    meta: { ...meta, cursor: meta.cursor ? "[present]" : null },
  });

  return { curatedPlaces: pageOut, meta };
}

module.exports = { runPaginatedSearch };
