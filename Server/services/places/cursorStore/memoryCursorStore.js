const memCursorStore = new Map();

function createMemoryCursorStore({ ttlSec, keyPrefix = "places:cursor:" } = {}) {
  if (!ttlSec) throw new Error("ttlSec is required");

  const key = (id) => `${keyPrefix}${id}`;

  async function set(id, state) {
    memCursorStore.set(key(id), { state, exp: Date.now() + ttlSec * 1000 });
  }

  async function get(id) {
    const hit = memCursorStore.get(key(id));
    if (!hit) return null;
    if (Date.now() > hit.exp) {
      memCursorStore.delete(key(id));
      return null;
    }
    return hit.state;
  }

  async function del(id) {
    memCursorStore.delete(key(id));
  }

  return { set, get, del };
}

module.exports = { createMemoryCursorStore };
