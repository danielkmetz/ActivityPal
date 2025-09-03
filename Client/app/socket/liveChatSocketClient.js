// liveChatSocketClient.js
import { io, Manager } from 'socket.io-client';
import { v4 as uuid } from 'uuid';
import 'react-native-get-random-values';

let socket = null;           // <- shared instance used by the helpers below
let manager = null;

const joinedRooms = new Set();
const defaultHandlers = {
  onNew: () => {},
  onDeleted: () => {},
  onPinned: () => {},
  onUnpinned: () => {},
  onSystem: () => {},
  onTyping: () => {},
  onTypingStop: () => {},
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

/**
 * Connect to the /live namespace (idempotent).
 * Resolves with the socket when connected.
 */
export function connectLiveSocket(serverOrigin, token) {
  const origin = normalizeOrigin(serverOrigin);

  // Reuse existing live socket if connected
  if (socket?.connected && socket.nsp === '/live') {
    log('connectLiveSocket: already connected', { id: socket.id, nsp: socket.nsp });
    return Promise.resolve(socket);
  }

  return new Promise((resolve, reject) => {
    try {
      // Create/Reuse a Manager tied to the ORIGIN (no namespace in URL)
      if (!manager) {
        manager = new Manager(origin, {
          // path: '/socket.io', // only set if you customized it on the server
          transports: ['websocket', 'polling'],
          auth: { token },
          extraHeaders: { Authorization: `Bearer ${token}` }, // best-effort on RN
          reconnectionAttempts: 5,
          reconnectionDelay: 700,
        });
        manager.on('open', () => log('MANAGER open'));
        manager.on('error', (e) => warn('MANAGER error', e?.message || e));
        manager.on('reconnect_failed', () => warn('MANAGER reconnect_failed'));
      }

      // Create a /live namespace socket from the manager
      const s = manager.socket('/live');
      log('connectLiveSocket: attempting', { origin, nsp: '/live' });

      // Wire lifecycle logs
      s.on('connect', () => {
        log('SOCKET connect', { id: s.id, nsp: s.nsp });
        // Re-join any rooms after a fresh connect
        joinedRooms.forEach((liveStreamId) => {
          s.emit('join', { liveStreamId }, (ack) => {
            if (!ack?.ok) {
              joinedRooms.delete(liveStreamId);
              warn('rejoin failed', { liveStreamId, error: ack?.error });
            } else {
              log('rejoined', { liveStreamId });
            }
          });
        });
        resolve(s);
      });

      s.on('connect_error', (e) => {
        warn('SOCKET connect_error', { message: e?.message, data: e });
        // don’t reject immediately; allow reconnection attempts.
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

      // finally store it so helpers can use it
      socket = s;
    } catch (e) {
      reject(e);
    }
  });
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

/** Join a room */
export function joinLiveStream(liveStreamId) {
  return new Promise((resolve, reject) => {
    if (!socket) {
      warn('joinLiveStream: no socket instance');
      return reject(new Error('Socket not connected'));
    }
    log('emit join →', { liveStreamId, sid: socket.id, connected: socket.connected });

    socket.emit('join', { liveStreamId }, (ack) => {
      if (ack?.ok) {
        log('join ack OK ←', { liveStreamId, sid: socket.id });
        joinedRooms.add(liveStreamId);
        resolve();
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

/** Raw access */
export function getLiveSocket() {
  return socket;
}
