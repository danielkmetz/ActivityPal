const { auditPush, pickIds } = require("./audit");

const ENFORCE_QUERYHASH_ON_CURSOR = process.env.ENFORCE_QUERYHASH_ON_CURSOR === "1";

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

async function serveFromCursor({ q, reqId, cursorId, perPageNum, cursorStore, useRedis }) {
  // Optional redis lock (off by default)
  let lockKey = null;
  const maybeRedis = cursorStore && typeof cursorStore._tryLock === "function";

  if (maybeRedis) {
    lockKey = cursorStore._lockKey(cursorId);
    // NOTE: original behavior "fail open" — do not block if lock isn't acquired
    await cursorStore._tryLock(lockKey, 2000);
  }

  try {
    const state = await cursorStore.get(cursorId);
    if (!state) {
      return { error: { status: 400, message: "Invalid or expired cursor. Start a new search." } };
    }

    const incomingHash = typeof q.queryHash === "string" ? q.queryHash : null;
    if (ENFORCE_QUERYHASH_ON_CURSOR && !incomingHash) {
      return { error: { status: 400, message: "queryHash required for cursor continuation." } };
    }
    if (incomingHash && state.queryHash && incomingHash !== state.queryHash) {
      return { error: { status: 400, message: "Query changed. Start a new search (reset cursor)." } };
    }

    state.pending = ensureArray(state.pending);

    const before = state.pending.length;
    const stateVersion = Number(state.version || 0);
    const statePageNo = Number(state.pageNo || 0);

    const pageItems = state.pending.splice(0, perPageNum);
    const after = state.pending.length;
    const hasMore = after > 0;

    state.version = stateVersion + 1;
    state.pageNo = statePageNo + 1;
    state.lastServedAtISO = new Date().toISOString();
    state.lastServedReqId = reqId || null;

    const servedHead = pickIds(pageItems, 3);
    const remainingHeadAfter = pickIds(state.pending, 3);

    auditPush(state, {
      t: Date.now(),
      kind: "serve",
      reqId: reqId || null,
      before,
      after,
      perPage: perPageNum,
      servedHead,
      remainingHeadAfter,
      version: state.version,
      pageNo: state.pageNo,
    });

    state.updatedAtISO = new Date().toISOString();

    if (hasMore) await cursorStore.set(cursorId, state);
    else await cursorStore.del(cursorId);

    return {
      curatedPlaces: pageItems,
      meta: {
        cursor: hasMore ? cursorId : null,
        perPage: perPageNum,
        hasMore,
        provider: "places2",
        storage: useRedis ? "redis" : "memory",
        queryHash: state.queryHash || null,

        pageNo: state.pageNo,
        version: state.version,
        remainingBefore: before,
        remainingAfter: after,
        servedHead,
        remainingHead: remainingHeadAfter,

        ...(q.debug ? { debug: { totals: state.totals, audit: state.audit || [] } } : {}),
      },
    };
  } finally {
    if (lockKey && cursorStore && typeof cursorStore._unlock === "function") {
      await cursorStore._unlock(lockKey);
    }
  }
}

module.exports = { serveFromCursor };
