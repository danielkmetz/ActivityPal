const { getRedisClient } = require("../../redis/client");

function createRedisCursorStore({ ttlSec, keyPrefix = "places:cursor:", logger = console } = {}) {
  if (!ttlSec) throw new Error("ttlSec is required");

  const key = (id) => `${keyPrefix}${id}`;

  async function set(id, state) {
    const client = await getRedisClient();
    await client.setEx(key(id), ttlSec, JSON.stringify(state));
  }

  async function get(id) {
    const client = await getRedisClient();
    const raw = await client.get(key(id));
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (e) {
      logger?.warn?.("redis cursor parse failed; deleting", { id });
      await client.del(key(id));
      return null;
    }
  }

  async function del(id) {
    const client = await getRedisClient();
    await client.del(key(id));
  }

  return { set, get, del };
}

module.exports = { createRedisCursorStore };
