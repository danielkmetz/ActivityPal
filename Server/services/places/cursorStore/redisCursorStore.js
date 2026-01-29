const { getRedisClient } = require("../../redis/client");

function createRedisCursorStore({
  ttlSec,
  keyPrefix = "places:cursor:",
  logger = console,
  fallbackStore = null, // NEW
} = {}) {
  if (!ttlSec) throw new Error("ttlSec is required");

  const key = (id) => `${keyPrefix}${id}`;

  async function set(id, state) {
    // Always try redis first
    try {
      const client = await getRedisClient();
      await client.setEx(key(id), ttlSec, JSON.stringify(state));
      return;
    } catch (e) {
      logger?.warn?.("redis cursor set failed; falling back", {
        id,
        message: e?.message,
        code: e?.code,
      });
      if (!fallbackStore?.set) throw e;
      await fallbackStore.set(id, state);
    }
  }

  async function get(id) {
    // Try redis
    try {
      const client = await getRedisClient();
      const raw = await client.get(key(id));
      if (!raw) {
        // optional fallback
        return fallbackStore?.get ? await fallbackStore.get(id) : null;
      }

      try {
        return JSON.parse(raw);
      } catch (e) {
        logger?.warn?.("redis cursor parse failed; deleting", { id });
        await client.del(key(id));
        // Try fallback if present
        return fallbackStore?.get ? await fallbackStore.get(id) : null;
      }
    } catch (e) {
      logger?.warn?.("redis cursor get failed; falling back", {
        id,
        message: e?.message,
        code: e?.code,
      });
      if (!fallbackStore?.get) throw e;
      return await fallbackStore.get(id);
    }
  }

  async function del(id) {
    // Best-effort delete in both stores
    try {
      const client = await getRedisClient();
      await client.del(key(id));
    } catch (e) {
      logger?.warn?.("redis cursor del failed", {
        id,
        message: e?.message,
        code: e?.code,
      });
    }

    if (fallbackStore?.del) {
      try {
        await fallbackStore.del(id);
      } catch (e) {
        logger?.warn?.("fallback cursor del failed", { id, message: e?.message });
      }
    }
  }

  return { set, get, del };
}

module.exports = { createRedisCursorStore };
