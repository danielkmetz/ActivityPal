const memCursorStore = new Map();

function createMemoryCursorStore({ ttlSec, keyPrefix = "places:cursor:" } = {}) {
  if (!ttlSec) throw new Error("ttlSec is required");

  const key = (id) => `${keyPrefix}${id}`;

  // Opportunistic sweep to prevent unbounded growth
  let ops = 0;
  function sweepExpired() {
    const now = Date.now();
    for (const [k, v] of memCursorStore.entries()) {
      if (v?.exp && now > v.exp) memCursorStore.delete(k);
    }
  }

  async function set(id, state) {
    memCursorStore.set(key(id), { state, exp: Date.now() + ttlSec * 1000 });

    ops++;
    if (ops % 200 === 0) sweepExpired(); // cheap, avoids leaks
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
