const DEFAULT_DEBOUNCE_MS = 150;

class Presence {
  constructor({ ioNamespace, redis = null, debounceMs = DEFAULT_DEBOUNCE_MS }) {
    this.nsp = ioNamespace;       // e.g., io.of('/live')
    this.redis = redis;           // ioredis client or null
    this.debounceMs = debounceMs;

    // in-memory fallback
    this.roomPeak = new Map();    // liveId -> number
    this.pending = new Map();     // liveId -> timeoutId
  }

  _key(liveId, leaf) { return `live:${liveId}:${leaf}`; } // conn/unique/peak

  async _readPeak(liveId) {
    if (!this.redis) return this.roomPeak.get(liveId) || 0;
    const s = await this.redis.get(this._key(liveId, 'peak'));
    return parseInt(s || '0', 10);
  }

  async _writePeak(liveId, value) {
    if (!this.redis) return this.roomPeak.set(liveId, value);
    await this.redis.set(this._key(liveId, 'peak'), String(value));
  }

  async _addUnique(liveId, userIdOrSocketId) {
    if (!this.redis) return; // unique via computePresence fallback below
    await this.redis.sadd(this._key(liveId, 'unique'), String(userIdOrSocketId));
  }

  async _uniqueCount(liveId, sockets, computedUnique) {
    if (!this.redis) return computedUnique;
    return this.redis.scard(this._key(liveId, 'unique'));
  }

  _debounce(liveId, fn) {
    if (this.pending.has(liveId)) return;
    const tid = setTimeout(async () => {
      this.pending.delete(liveId);
      try { await fn(); } catch (_) {}
    }, this.debounceMs);
    this.pending.set(liveId, tid);
  }

  /** Recomputes presence from adapter sockets; emits `presence` and updates peak. */
  async recomputeAndEmit(liveId) {
    const sockets = await this.nsp.in(liveId).fetchSockets();

    // Build unique by user id (fallback) + guests
    const userIds = new Set();
    let guests = 0;
    for (const s of sockets) {
      const uid = s.user?.id || s.handshake?.auth?.userId;
      if (uid) userIds.add(String(uid)); else guests++;
    }

    const concurrent = sockets.length;
    const computedUnique = userIds.size + guests;

    const currentPeak = await this._readPeak(liveId);
    if (concurrent > currentPeak) await this._writePeak(liveId, concurrent);

    // If Redis configured, maintain unique set authoritatively.
    if (this.redis) {
      // Only add *newly seen* ids; safe to add all—we’re using a set.
      for (const uid of userIds) await this._addUnique(liveId, uid);
      // Don’t add guests to unique in Redis (they’re ephemeral)
    }

    const unique = await this._uniqueCount(liveId, sockets, computedUnique);

    this.nsp.to(liveId).emit('presence', {
      liveStreamId: liveId,
      viewerCount: concurrent,
      uniqueCount: unique,
      peak: Math.max(concurrent, currentPeak),
    });
  }

  scheduleRecompute(liveId) {
    this._debounce(liveId, () => this.recomputeAndEmit(liveId));
  }

  /** Returns { current, unique, peak } for finalization. */
  async readSnapshot(liveId) {
    const sockets = await this.nsp.in(liveId).fetchSockets();
    const userIds = new Set();
    let guests = 0;
    for (const s of sockets) {
      const uid = s.user?.id || s.handshake?.auth?.userId;
      if (uid) userIds.add(String(uid)); else guests++;
    }
    const concurrent = sockets.length;
    const computedUnique = userIds.size + guests;
    const peak = await this._readPeak(liveId);
    const unique = await this._uniqueCount(liveId, sockets, computedUnique);
    return { current: concurrent, unique, peak };
  }

  /** Cleanup keys when a stream ends */
  async cleanup(liveId) {
    this.roomPeak.delete(liveId);
    if (this.redis) {
      await Promise.allSettled([
        this.redis.del(this._key(liveId, 'peak')),
        this.redis.del(this._key(liveId, 'unique')),
      ]);
    }
  }
}

module.exports = { Presence };
