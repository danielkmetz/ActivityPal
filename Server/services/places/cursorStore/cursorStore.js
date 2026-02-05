const DEFAULT_SWEEP_EVERY_OPS = 200;
const DEFAULT_LOCK_TTL_MS = 8000;

function createMemoryCursorStore({
  ttlSec,
  keyPrefix = "places:cursor:",
  sweepEveryOps = DEFAULT_SWEEP_EVERY_OPS,
  enableNoopLocks = true, // <-- makes consumers simpler
} = {}) {
  if (!ttlSec) throw new Error("ttlSec is required");

  const map = new Map();
  const key = (id) => `${keyPrefix}${id}`;
  const lockKey = (id) => `${keyPrefix}${id}:lock`;
  let ops = 0;

  function sweepExpired() {
    const now = Date.now();
    for (const [k, v] of map.entries()) {
      if (v?.exp && now > v.exp) map.delete(k);
    }
  }

  async function set(id, state) {
    map.set(key(id), { state, exp: Date.now() + ttlSec * 1000 });

    ops++;
    if (sweepEveryOps && ops % sweepEveryOps === 0) sweepExpired();
  }

  async function get(id) {
    const hit = map.get(key(id));
    if (!hit) return null;

    if (Date.now() > hit.exp) {
      map.delete(key(id));
      return null;
    }
    return hit.state;
  }

  async function del(id) {
    map.delete(key(id));
  }

  // Optional: expose no-op lock helpers so callers never need optional chaining
  const noopLocks = enableNoopLocks
    ? {
        _tryLock: async () => true,
        _unlock: async () => {},
        _lockKey: lockKey,
      }
    : {};

  return { set, get, del, ...noopLocks };
}

// Best-effort NX lock supporting node-redis v4 or ioredis.
// Fail-open by design (locking is an optional optimization).
async function tryLockGeneric(client, lockKey, ttlMs) {
  if (!client) return true;

  // node-redis v4: client.set(key, value, { PX, NX })
  try {
    const res = await client.set(lockKey, "1", { PX: ttlMs, NX: true });
    if (res === "OK" || res === true) return true;
    if (res === null) return false;
    return !!res;
  } catch {
    // fall through
  }

  // ioredis: client.set(key, value, "PX", ttlMs, "NX")
  try {
    const res = await client.set(lockKey, "1", "PX", ttlMs, "NX");
    return res === "OK";
  } catch {
    return true; // fail open
  }
}

function createRedisCursorStore({
  ttlSec,
  keyPrefix = "places:cursor:",
  fallbackStore,
  logger = console,

  // Option A: preferred (your server redis client)
  getRedisClient = null,

  // Option B: optional ioredis
  redisUrl = process.env.REDIS_URL,

  enableOpLock = process.env.ENABLE_CURSOR_OP_LOCK === "1",
  lockTtlMs = DEFAULT_LOCK_TTL_MS,
} = {}) {
  if (!ttlSec) throw new Error("ttlSec is required");
  if (!fallbackStore) throw new Error("fallbackStore is required");

  const key = (id) => `${keyPrefix}${id}`;
  const lockKey = (id) => `${keyPrefix}${id}:lock`;

  // Lazy ioredis client if needed
  let ioRedisClient = null;
  function getIORedisClient() {
    if (ioRedisClient) return ioRedisClient;
    if (!redisUrl) return null;

    let RedisCtor = null;
    try {
      RedisCtor = require("ioredis");
    } catch {
      return null;
    }

    try {
      ioRedisClient = new RedisCtor(redisUrl);
      return ioRedisClient;
    } catch {
      return null;
    }
  }

  async function getClient() {
    if (getRedisClient) return await getRedisClient();
    return getIORedisClient();
  }

  async function set(id, state) {
    const k = key(id);
    try {
      const client = await getClient();
      if (!client) throw new Error("redis client unavailable");

      const raw = JSON.stringify(state);

      // node-redis v4
      if (typeof client.setEx === "function") {
        await client.setEx(k, ttlSec, raw);
        return;
      }

      // ioredis
      if (typeof client.set === "function") {
        await client.set(k, raw, "EX", ttlSec);
        return;
      }

      throw new Error("redis client missing set/setEx");
    } catch (e) {
      logger?.warn?.("redis cursor set failed; falling back", { id, message: e?.message });
      await fallbackStore.set(id, state);
    }
  }

  async function get(id) {
    const k = key(id);
    try {
      const client = await getClient();
      if (!client) throw new Error("redis client unavailable");

      const raw = await client.get(k);
      if (!raw) return fallbackStore?.get ? await fallbackStore.get(id) : null;

      try {
        return JSON.parse(raw);
      } catch (e) {
        logger?.warn?.("redis cursor parse failed; deleting", { id });
        try {
          if (typeof client.del === "function") await client.del(k);
        } catch {}
        return fallbackStore?.get ? await fallbackStore.get(id) : null;
      }
    } catch (e) {
      logger?.warn?.("redis cursor get failed; falling back", { id, message: e?.message });
      return fallbackStore?.get ? await fallbackStore.get(id) : null;
    }
  }

  async function del(id) {
    const k = key(id);
    try {
      const client = await getClient();
      if (client && typeof client.del === "function") await client.del(k);
    } catch (e) {
      logger?.warn?.("redis cursor del failed", { id, message: e?.message });
    }

    if (fallbackStore?.del) {
      try {
        await fallbackStore.del(id);
      } catch (e) {
        logger?.warn?.("fallback cursor del failed", { id, message: e?.message });
      }
    }
  }

  async function _tryLock(id) {
    if (!enableOpLock) return true;
    try {
      const client = await getClient();
      return await tryLockGeneric(client, lockKey(id), lockTtlMs);
    } catch {
      return true; // fail open
    }
  }

  async function _unlock(id) {
    if (!enableOpLock) return;
    try {
      const client = await getClient();
      if (client && typeof client.del === "function") await client.del(lockKey(id));
    } catch {}
  }

  return { set, get, del, _tryLock, _unlock, _lockKey: lockKey };
}

/**
 * This is the “bottom logic” you actually want shared:
 * build a configured store for either API by passing keyPrefix + ttlSec.
 */
function createCursorStore({
  ttlSec,
  keyPrefix,
  logger = console,
  getRedisClient = null,
  redisUrl = process.env.REDIS_URL,
  enableOpLock = process.env.ENABLE_CURSOR_OP_LOCK === "1",
  lockTtlMs = DEFAULT_LOCK_TTL_MS,
  sweepEveryOps = DEFAULT_SWEEP_EVERY_OPS,
} = {}) {
  if (!ttlSec) throw new Error("ttlSec is required");
  if (!keyPrefix) throw new Error("keyPrefix is required");

  const useRedis = !!(getRedisClient || redisUrl);

  const memoryStore = createMemoryCursorStore({
    ttlSec,
    keyPrefix,
    sweepEveryOps,
    enableNoopLocks: true, // important: simplifies all callers
  });

  if (!useRedis) {
    return { cursorStore: memoryStore, useRedis: false, memoryStore };
  }

  const redisStore = createRedisCursorStore({
    ttlSec,
    keyPrefix,
    fallbackStore: memoryStore,
    logger,
    getRedisClient,
    redisUrl,
    enableOpLock,
    lockTtlMs,
  });

  return { cursorStore: redisStore, useRedis: true, memoryStore };
}

module.exports = {
  createMemoryCursorStore,
  createRedisCursorStore,
  createCursorStore,
};
