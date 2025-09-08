// liveChatSocketClient.js
import { Manager } from 'socket.io-client';
import { v4 as uuid } from 'uuid';
import 'react-native-get-random-values';

let socket = null;     // shared /live namespace socket
let manager = null;    // per-origin manager

const joinedRooms = new Set();

const defaultHandlers = {
  onNew: () => {},
  onDeleted: () => {},
  onPinned: () => {},
  onUnpinned: () => {},
  onSystem: () => {},
  onTyping: () => {},
  onTypingStop: () => {},
  onPresence: () => {},  // { liveStreamId, viewerCount, uniqueCount }
};
let handlers = { ...defaultHandlers };

// -------- logging helpers --------
const CLIENT_SESSION = uuid().slice(0, 8);
const t0 = Date.now();
const since = () => `${String(Date.now() - t0).padStart(6, ' ')}ms`;
const tag = () => `[liveClient ${CLIENT_SESSION}] ${since()}`;
const log  = (...a) => console.log(tag(), ...a);
const warn = (...a) => console.warn(tag(), ...a);
const err  = (...a) => console.warn(`${tag()} ERROR`, ...a);

function normalizeOrigin(u) {
  let base = (u || '').replace(/\/$/, '');
  if (/\/api(\/|$)/i.test(base)) {
    warn('serverOrigin includes `/api` – stripping it for sockets');
    base = base.replace(/\/api\/?$/i, '');
  }
  return base;
}

function bindSocketEvents(s) {
  // clear any previously attached listeners we own
  ['connect','connect_error','error','disconnect','new','deleted','pinned','unpinned','chat:system','typing','typing:stop','presence']
    .forEach(evt => { try { s.off(evt); } catch {} });

  s.on('connect', () => {
    log('SOCKET connect', { id: s.id, nsp: s.nsp });

    // Re-join rooms after a fresh connect; ack may carry presence counts
    joinedRooms.forEach((liveStreamId) => {
      s.emit('join', { liveStreamId }, (ack) => {
        if (!ack?.ok) {
          joinedRooms.delete(liveStreamId);
          warn('rejoin failed', { liveStreamId, error: ack?.error });
        } else {
          log('rejoined', { liveStreamId, viewerCount: ack.viewerCount, uniqueCount: ack.uniqueCount });
          if (ack.viewerCount != null || ack.uniqueCount != null) {
            handlers.onPresence?.({
              liveStreamId,
              viewerCount: ack.viewerCount,
              uniqueCount: ack.uniqueCount,
            });
          }
        }
      });
    });
  });

  s.on('connect_error', (e) => {
    warn('SOCKET connect_error', { message: e?.message, data: e });
  });
  s.on('error', (e) => warn('SOCKET error', e));
  s.on('disconnect', (reason) => log('SOCKET disconnect', { reason }));

  // ----- Server events → user handlers -----
  s.on('new', (message) => {
    log('evt:new', { id: message?._id });
    handlers.onNew?.(message);
  });
  s.on('deleted', ({ messageId }) => {
    log('evt:deleted', { messageId });
    handlers.onDeleted?.({ messageId });
  });
  s.on('pinned', ({ messageId }) => {
    log('evt:pinned', { messageId });
    handlers.onPinned?.({ messageId });
  });
  s.on('unpinned', () => {
    log('evt:unpinned');
    handlers.onUnpinned?.();
  });
  s.on('chat:system', (evt) => {
    log('evt:system', evt);
    handlers.onSystem?.(evt);
  });
  s.on('typing', ({ userId }) => {
    handlers.onTyping?.({ userId });
  });
  s.on('typing:stop', ({ userId }) => {
    handlers.onTypingStop?.({ userId });
  });

  // Presence (counts)
  s.on('presence', (evt) => {
    // evt: { liveStreamId, viewerCount, uniqueCount }
    log('evt:presence', evt);
    handlers.onPresence?.(evt);
  });
}

/**
 * Connect to the /live namespace (idempotent).
 * Resolves with the socket when connected or already connected.
 */
export function connectLiveSocket(serverOrigin, token) {
  const origin = normalizeOrigin(serverOrigin);

  if (socket?.connected && socket.nsp === '/live') {
    log('connectLiveSocket: already connected', { id: socket.id, nsp: socket.nsp });
    return Promise.resolve(socket);
  }

  return new Promise((resolve, reject) => {
    try {
      if (!manager) {
        manager = new Manager(origin, {
          // path: '/socket.io', // set if customized server-side
          transports: ['websocket', 'polling'],
          auth: { token },
          extraHeaders: { Authorization: `Bearer ${token}` },
          reconnectionAttempts: 5,
          reconnectionDelay: 700,
        });
        manager.on('open', () => log('MANAGER open'));
        manager.on('error', (e) => warn('MANAGER error', e?.message || e));
        manager.on('reconnect_failed', () => warn('MANAGER reconnect_failed'));
      } else {
        // refresh token on existing manager
        if (token) {
          manager.opts.auth = { token };
          manager.opts.extraHeaders = { ...(manager.opts.extraHeaders || {}), Authorization: `Bearer ${token}` };
        }
      }

      const s = manager.socket('/live');
      bindSocketEvents(s);
      log('connectLiveSocket: attempting', { origin, nsp: '/live' });

      // store and resolve on connect (if already connected, 'connect' may not fire; resolve immediately)
      socket = s;
      if (s.connected) {
        log('connectLiveSocket: socket already connected', { id: s.id });
        resolve(s);
      } else {
        s.once('connect', () => resolve(s));
      }
    } catch (e) {
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
  try { socket?.disconnect(); } catch {}
  if (destroy) {
    try { manager?.close(); } catch {}
    manager = null;
    socket = null;
    joinedRooms.clear();
  }
}

/** Register event handlers (partial updates ok) */
export function onLiveEvents(newHandlers = {}) {
  handlers = { ...handlers, ...newHandlers };
  log('handlers updated', Object.keys(newHandlers));
}

/** Clear handlers (optional) */
export function clearLiveHandlers() {
  handlers = { ...defaultHandlers };
  log('handlers cleared');
}

/** Send a chat message */
export function sendLiveMessage({ liveStreamId, text, type = 'message' }) {
  return new Promise((resolve) => {
    if (!socket) {
      warn('sendLiveMessage: no socket instance');
      return resolve({ ok: false, error: 'Socket not connected' });
    }
    if (!text || !text.trim()) {
      warn('sendLiveMessage: empty text');
      return resolve({ ok: false, error: 'Empty text' });
    }

    const localId = uuid();
    log('emit send →', { liveStreamId, localId, type, textLen: text.length, sid: socket.id });

    socket.emit('send', { liveStreamId, localId, text, type }, (ack) => {
      if (ack?.ok) {
        log('send ack OK ←', { liveStreamId, localId, messageId: ack?.message?._id });
        resolve({ ok: true, message: ack.message, localId });
      } else {
        warn('send ack FAIL ←', { liveStreamId, localId, error: ack?.error });
        resolve({ ok: false, error: ack?.error || 'send failed', localId });
      }
    });
  });
}

/** Join a room (resolves with ack: { ok, viewerCount?, uniqueCount? }) */
export function joinLiveStream(liveStreamId) {
  return new Promise((resolve, reject) => {
    if (!socket) {
      warn('joinLiveStream: no socket instance');
      return reject(new Error('Socket not connected'));
    }
    log('emit join →', { liveStreamId, sid: socket.id, connected: socket.connected });

    socket.emit('join', { liveStreamId }, (ack) => {
      if (ack?.ok) {
        log('join ack OK ←', {
          liveStreamId,
          sid: socket.id,
          viewerCount: ack.viewerCount,
          uniqueCount: ack.uniqueCount,
        });
        joinedRooms.add(liveStreamId);
        if (ack.viewerCount != null || ack.uniqueCount != null) {
          handlers.onPresence?.({
            liveStreamId,
            viewerCount: ack.viewerCount,
            uniqueCount: ack.uniqueCount,
          });
        }
        resolve(ack);
      } else {
        warn('join ack FAIL ←', { liveStreamId, sid: socket.id, error: ack?.error });
        reject(new Error(ack?.error || 'join failed'));
      }
    });
  });
}

/** Leave a room */
export function leaveLiveStream(liveStreamId) {
  if (!socket) {
    warn('leaveLiveStream: no socket instance');
    return;
  }
  log('emit leave →', { liveStreamId, sid: socket.id });
  socket.emit('leave', { liveStreamId }, () => {
    joinedRooms.delete(liveStreamId);
    log('leave ack (no payload) ←', { liveStreamId });
  });
}

/** Typing indicator */
export function setLiveTyping(liveStreamId, isTyping) {
  if (!socket) return warn('setLiveTyping: no socket instance');
  if (!liveStreamId) return warn('setLiveTyping: missing liveStreamId');
  const evt = isTyping ? 'typing' : 'typing:stop';
  log(`emit ${evt} →`, { liveStreamId });
  socket.emit(evt, { liveStreamId });
}

/** Request current stats on demand (presence) */
export function getLiveStats(liveStreamId, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (!socket) {
      warn('getLiveStats: no socket instance');
      return resolve({ ok: false, error: 'Socket not connected' });
    }
    const withTimeout = socket.timeout ? socket.timeout(timeoutMs) : null;
    const emitter = withTimeout?.emit ? withTimeout.emit.bind(withTimeout) : socket.emit.bind(socket);

    emitter('stats', { liveStreamId }, (err, ack) => {
      if (err) {
        warn('stats timeout', { liveStreamId });
        return resolve({ ok: false, error: 'timeout' });
      }
      if (ack?.ok) {
        log('stats ack OK ←', { liveStreamId, viewerCount: ack.viewerCount, uniqueCount: ack.uniqueCount });
        return resolve(ack);
      }
      resolve({ ok: false, error: ack?.error || 'stats failed' });
    });
  });
}

/** Fetch the current viewer list (server returns { ok, viewers, total?, unique? }) */
export function getLiveViewers(liveStreamId, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!socket) {
      warn('getLiveViewers: no socket instance');
      return resolve({ ok: false, error: 'Socket not connected' });
    }
    const withTimeout = socket.timeout ? socket.timeout(timeoutMs) : null;
    const emitter = withTimeout?.emit ? withTimeout.emit.bind(withTimeout) : socket.emit.bind(socket);

    log('emit viewers →', { liveStreamId });
    emitter('viewers', { liveStreamId }, (err, ack) => {
      if (err) {
        warn('viewers timeout', { liveStreamId });
        return resolve({ ok: false, error: 'timeout' });
      }
      if (ack?.ok) {
        log('viewers ack OK ←', { liveStreamId, count: ack.viewers?.length ?? 0 });
        return resolve(ack);
      }
      resolve({ ok: false, error: ack?.error || 'viewers failed' });
    });
  });
}

/** Convenience: are we connected to /live? */
export function isLiveSocketConnected() {
  return !!(socket && socket.connected && socket.nsp === '/live');
}

/** Raw access */
export function getLiveSocket() {
  return socket;
}
