import { Manager } from 'socket.io-client';
import { v4 as uuid } from 'uuid';
import store from '../../store';
import 'react-native-get-random-values';
import { setPresence, clearPresence, selectLivePresence } from '../../Slices/LiveChatSlice';

// ---- Add near the top (after imports)
const DEBUG_LIVE = true; // flip to false in prod or wire to env
const CLIENT_SESSION = uuid().slice(0, 8);

function dlog(...args) { if (DEBUG_LIVE) console.log('[LIVE]', CLIENT_SESSION, ...args); }
function dwarn(...args) { if (DEBUG_LIVE) console.warn('[LIVE]', CLIENT_SESSION, ...args); }
function derr(...args) { if (DEBUG_LIVE) console.error('[LIVE]', CLIENT_SESSION, ...args); }


let socket = null;     // shared /live namespace socket
let manager = null;    // per-origin manager
const joinedRooms = new Set();
const lastPresence = new Map(); // liveStreamId -> { viewerCount, uniqueCount, peak? }

// -----------------------------
// Handler registries
// -----------------------------

// 🔒 Global, app-wide lifecycle (rail/presence) handlers
const globalHandlers = {
  onLiveStarted: () => { },   // payload: liveDoc (sanitized by server)
  onLiveEnded: () => { },     // payload: { liveId }
  onPresence: () => { },      // payload: { liveStreamId, viewerCount, uniqueCount }
};

// 🎯 Room-scoped chat handlers (message/pin/typing/system)
let roomHandlers = {
  onNew: () => { },
  onDeleted: () => { },
  onPinned: () => { },
  onUnpinned: () => { },
  onSystem: () => { },
  onTyping: () => { },
  onTypingStop: () => { },
  onLiveEnded: () => { },
};

// -----------------------------
// URL normalizer
// -----------------------------
function normalizeOrigin(u) {
  let base = (u || '').replace(/\/$/, '');
  if (/\/api(\/|$)/i.test(base)) {
    base = base.replace(/\/api\/?$/i, '');
  }
  return base;
}

// -----------------------------
// Socket event binding
// -----------------------------
function bindSocketEvents(s) {
  // clear any previously attached listeners we own
  [
    'connect', 'connect_error', 'error', 'disconnect',
    'new', 'deleted', 'pinned', 'unpinned', 'chat:system',
    'typing', 'typing:stop', 'presence', 'live:started', 'live:ended'
  ].forEach(evt => { try { s.off(evt); } catch { } });

  if (DEBUG_LIVE) {
    try { s.offAny(); } catch {}
    s.onAny((event, ...args) => dlog('onAny', event, args?.[0] ?? '(no payload)'));
  }

  s.on('connect', () => {
    // Re-join rooms after a fresh connect; ack may carry presence counts
    joinedRooms.forEach((liveStreamId) => {
      s.emit('join', { liveStreamId }, (ack) => {
        if (!ack?.ok) {
          joinedRooms.delete(liveStreamId);
        } else {
          if (ack.viewerCount != null || ack.uniqueCount != null || ack.peak != null) {
            lastPresence.set(liveStreamId, {
              viewerCount: ack.viewerCount ?? 0,
              uniqueCount: ack.uniqueCount ?? 0,
              peak: ack.peak,
            });
            globalHandlers.onPresence?.({
              liveStreamId,
              viewerCount: ack.viewerCount,
              uniqueCount: ack.uniqueCount,
              peak: ack.peak,
            });
            store.dispatch(setPresence({
              liveStreamId,
              viewerCount: ack.viewerCount ?? 0,
              uniqueCount: ack.uniqueCount ?? 0,
              peak: ack.peak,
            }));
          }
        }
      });
    });
  });

  s.on('connect_error', () => { });
  s.on('error', () => { });
  s.on('disconnect', () => { });

  // -------- Global lifecycle / presence --------
  s.on('presence', (evt) => {
    // evt: { liveStreamId, viewerCount, uniqueCount, peak }
    if (!evt || !evt.liveStreamId) return;
    lastPresence.set(evt.liveStreamId, {
      viewerCount: evt.viewerCount ?? lastPresence.get(evt.liveStreamId)?.viewerCount ?? 0,
      uniqueCount: evt.uniqueCount ?? lastPresence.get(evt.liveStreamId)?.uniqueCount ?? 0,
      peak: evt.peak ?? lastPresence.get(evt.liveStreamId)?.peak ?? undefined,
    });
    store.dispatch(setPresence({
      liveStreamId: evt.liveStreamId,
      viewerCount: evt.viewerCount,
      uniqueCount: evt.uniqueCount,
      peak: evt.peak,
    }));
    globalHandlers.onPresence?.(evt);
  });

  s.on('live:started', (live) => {
    globalHandlers.onLiveStarted?.(live);
  });

  s.on('live:ended', ({ liveId }) => {
    // if we are in that room, leave it to stop presence/typing noise
    if (joinedRooms.has(liveId)) {
      try { s.emit('leave', { liveStreamId: liveId }, () => { }); } catch { }
      joinedRooms.delete(liveId);
    }
    lastPresence.delete(liveId);
    store.dispatch(clearPresence({ liveStreamId: liveId }));
    globalHandlers.onLiveEnded?.({ liveId });
    roomHandlers.onLiveEnded?.({ liveId });
  });

  // -------- Room-scoped chat events --------
  s.on('new', (message) => {
    roomHandlers.onNew?.(message);
  });
  s.on('deleted', ({ messageId }) => {
    roomHandlers.onDeleted?.({ messageId });
  });
  s.on('pinned', ({ messageId }) => {
    roomHandlers.onPinned?.({ messageId });
  });
  s.on('unpinned', () => {
    roomHandlers.onUnpinned?.();
  });
  s.on('chat:system', (evt) => {
    roomHandlers.onSystem?.(evt);
  });
  s.on('typing', ({ userId }) => {
    roomHandlers.onTyping?.({ userId });
  });
  s.on('typing:stop', ({ userId }) => {
    roomHandlers.onTypingStop?.({ userId });
  });
}

// -----------------------------
// Public API
// -----------------------------

/**
 * Connect to the /live namespace (idempotent).
 * Resolves with the socket when connected or already connected.
 */
export function connectLiveSocket(serverOrigin, token) {
  const origin = normalizeOrigin(serverOrigin);
  if (socket?.connected && socket.nsp === '/live') {
    return Promise.resolve(socket);
  }

  return new Promise((resolve, reject) => {
    try {
      if (!manager) {
        manager = new Manager(origin, {
          transports: ['websocket', 'polling'],
          auth: { token },
          extraHeaders: { Authorization: `Bearer ${token}` },
          reconnectionAttempts: 5,
          reconnectionDelay: 700,
        });
        manager.on('open', () => dlog('manager open'));
        manager.on('error', (e) => derr('manager error', e?.message || e));
        manager.on('reconnect_failed', () => dwarn('manager reconnect_failed'));
      } else {
        manager.opts.auth = { token };
        manager.opts.extraHeaders = { ...(manager.opts.extraHeaders || {}), Authorization: `Bearer ${token}` };
      }

      const s = manager.socket('/live');
      
      bindSocketEvents(s); // will attach onAny too
      socket = s;

      if (s.connected) {
        resolve(s);
      } else {
        s.once('connect', () => {
          resolve(s);
        });
      }
    } catch (e) {
      derr('connectLiveSocket threw', e);
      reject(e);
    }
  });
}

/** Update the auth token without rebuilding the manager/socket */
export function updateLiveAuth(token) {
  if (!token) return;
  if (manager) {
    manager.opts.auth = { token };
    manager.opts.extraHeaders = { ...(manager.opts.extraHeaders || {}), Authorization: `Bearer ${token}` };
  }
  if (socket) {
    socket.auth = { ...(socket.auth || {}), token };
    // To enforce a new handshake with updated auth, you can optionally:
    // socket.disconnect().connect();
  }
}

/** Cleanly disconnect (and optionally destroy) */
export function disconnectLiveSocket({ destroy = false } = {}) {
  try { socket?.disconnect(); } catch { }
  if (destroy) {
    try { manager?.close(); } catch { }
    manager = null;
    socket = null;
    joinedRooms.clear();
  }
}

/** GLOBAL: register app-wide lifecycle handlers */
export function setGlobalLiveHandlers(h = {}) {
  const keys = Object.keys(h || {});
  keys.forEach((k) => {
    if (k in globalHandlers) globalHandlers[k] = h[k] || globalHandlers[k];
  });
}

/** ROOM: register room-scoped chat handlers */
export function setRoomLiveHandlers(h = {}) {
  roomHandlers = { ...roomHandlers, ...h };
}

/** ROOM: clear room-scoped chat handlers (does NOT touch global handlers) */
export function clearRoomLiveHandlers() {
  roomHandlers = {
    onNew: () => { },
    onDeleted: () => { },
    onPinned: () => { },
    onUnpinned: () => { },
    onSystem: () => { },
    onTyping: () => { },
    onTypingStop: () => { },
    onLiveEnded: () => { },
  };
}

// ---- Back-compat shims ----
// Treat onLiveEvents as GLOBAL registration.
export function onLiveEvents(newHandlers = {}) {
  setGlobalLiveHandlers(newHandlers);
}
// Do NOT clear global handlers from rooms; keep this as a no-op shim that only clears room.
export function clearLiveHandlers() {
  clearRoomLiveHandlers();
}

/** Send a chat message */
export function sendLiveMessage({ liveStreamId, text, type = 'message' }) {
  return new Promise((resolve) => {
    if (!socket) {
      return resolve({ ok: false, error: 'Socket not connected' });
    }
    if (!text || !text.trim()) {
      return resolve({ ok: false, error: 'Empty text' });
    }

    const localId = uuid();

    socket.emit('send', { liveStreamId, localId, text, type }, (ack) => {
      if (ack?.ok) {
        resolve({ ok: true, message: ack.message, localId });
      } else {
        resolve({ ok: false, error: ack?.error || 'send failed', localId });
      }
    });
  });
}

/** Join a room (resolves with ack: { ok, viewerCount?, uniqueCount? }) */
export function joinLiveStream(liveStreamId) {
  return new Promise((resolve, reject) => {
    if (!socket) {
      return reject(new Error('Socket not connected'));
    }

    socket.emit('join', { liveStreamId }, (ack) => {
      if (ack?.ok) {
        joinedRooms.add(liveStreamId);
        if (ack.viewerCount != null || ack.uniqueCount != null || ack.peak != null) {
          // keep the local cache in sync
          lastPresence.set(liveStreamId, {
            viewerCount: ack.viewerCount ?? 0,
            uniqueCount: ack.uniqueCount ?? 0,
            peak: ack.peak,
          });
          // update Redux
          store.dispatch(setPresence({
            liveStreamId,
            viewerCount: ack.viewerCount ?? 0,
            uniqueCount: ack.uniqueCount ?? 0,
            peak: ack.peak,
          }));
          // still call the global handler for any UI listeners
          globalHandlers.onPresence?.({
            liveStreamId,
            viewerCount: ack.viewerCount,
            uniqueCount: ack.uniqueCount,
            peak: ack.peak,
          });
        }
        resolve(ack);
      } else {
        reject(new Error(ack?.error || 'join failed'));
      }
    });
  });
}

/** Leave a room */
export function leaveLiveStream(liveStreamId) {
  if (!socket) return;
  socket.emit('leave', { liveStreamId }, () => {
    joinedRooms.delete(liveStreamId);
  });
}

/** Typing indicator */
export function setLiveTyping(liveStreamId, isTyping) {
  if (!socket) return;
  if (!liveStreamId) return;
  const evt = isTyping ? 'typing' : 'typing:stop';
  socket.emit(evt, { liveStreamId });
}

/** Fetch the current viewer list (server returns { ok, viewers, total?, unique? }) */
export function getLiveViewers(liveStreamId, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!socket) {
      return resolve({ ok: false, error: 'Socket not connected' });
    }
    const withTimeout = socket.timeout ? socket.timeout(timeoutMs) : null;
    const emitter = withTimeout?.emit ? withTimeout.emit.bind(withTimeout) : socket.emit.bind(socket);

    emitter('viewers', { liveStreamId }, (err, ack) => {
      if (err) {
        return resolve({ ok: false, error: 'timeout' });
      }
      if (ack?.ok) {
        return resolve(ack);
      }
      resolve({ ok: false, error: ack?.error || 'viewers failed' });
    });
  });
}

export function getLiveStats(liveStreamId) {
  const p = selectLivePresence(store.getState(), liveStreamId);
  if (!p) return Promise.resolve({ ok: false, error: 'no snapshot' });
  return Promise.resolve({ ok: true, viewerCount: p.viewerCount, uniqueCount: p.uniqueCount, peak: p.peak });
}

/** Convenience: are we connected to /live? */
export function isLiveSocketConnected() {
  return !!(socket && socket.connected && socket.nsp === '/live');
}

/** Raw access */
export function getLiveSocket() {
  return socket;
}
