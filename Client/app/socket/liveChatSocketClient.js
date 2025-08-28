import io from 'socket.io-client';
import { v4 as uuid } from 'uuid';
import 'react-native-get-random-values'; // safe in RN; no-op on web

let socket = null;
const joinedRooms = new Set();
const defaultHandlers = {
  onNew:      () => {},
  onDeleted:  () => {},
  onPinned:   () => {},
  onUnpinned: () => {},
  onSystem:   () => {},
  onTyping:   () => {},
  onTypingStop: () => {},
};
let handlers = { ...defaultHandlers };

/**
 * Connect to /live namespace. Idempotent.
 * @param {string} serverUrl e.g. https://api.example.com
 * @param {string} token     JWT string
 */
export function connectLiveSocket(serverUrl, token) {
  if (socket?.connected) return socket;

  socket = io(`${serverUrl}/live`, {
    transports: ['websocket'],
    auth: { token },
    reconnectionAttempts: 20,
    reconnectionDelay: 500,
  });

  socket.on('connect', () => {
    // Re-join any rooms we had joined before a reconnect
    joinedRooms.forEach((liveStreamId) => {
      socket.emit('join', { liveStreamId }, (ack) => {
        if (!ack?.ok) {
          // if join fails, drop it so we don't keep retrying on every reconnect
          joinedRooms.delete(liveStreamId);
          console.warn('join failed after reconnect:', liveStreamId, ack?.error);
        }
      });
    });
  });

  socket.on('disconnect', () => {
    // keep joinedRooms; we'll try to rejoin on reconnect
  });

  // ----- Server events -----
  socket.on('new', (message) => handlers.onNew(message));
  socket.on('deleted', ({ messageId }) => handlers.onDeleted({ messageId }));
  socket.on('pinned', ({ messageId }) => handlers.onPinned({ messageId }));
  socket.on('unpinned', () => handlers.onUnpinned());
  socket.on('chat:system', (evt) => handlers.onSystem(evt));
  socket.on('typing', ({ userId }) => handlers.onTyping({ userId }));
  socket.on('typing:stop', ({ userId }) => handlers.onTypingStop({ userId }));

  return socket;
}

/**
 * Register event handlers. You can call multiple times; pass only what you need.
 * {
 *   onNew, onDeleted, onPinned, onUnpinned, onSystem, onTyping, onTypingStop
 * }
 */
export function onLiveEvents(newHandlers = {}) {
  handlers = { ...handlers, ...newHandlers };
}

/** Clear handlers (optional) */
export function clearLiveHandlers() {
  handlers = { ...defaultHandlers };
}

/**
 * Join a live stream room
 * @param {string} liveStreamId
 * @returns {Promise<void>}
 */
export function joinLiveStream(liveStreamId) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('Socket not connected'));
    socket.emit('join', { liveStreamId }, (ack) => {
      if (ack?.ok) {
        joinedRooms.add(liveStreamId);
        resolve();
      } else {
        reject(new Error(ack?.error || 'join failed'));
      }
    });
  });
}

/**
 * Leave a live stream room
 * @param {string} liveStreamId
 */
export function leaveLiveStream(liveStreamId) {
  if (!socket) return;
  socket.emit('leave', { liveStreamId }, () => {
    joinedRooms.delete(liveStreamId);
  });
}

/**
 * Send a chat message (optimistic-safe via server ack).
 * Returns { ok, message?, error?, localId }
 */
export function sendLiveMessage({ liveStreamId, text, type = 'message' }) {
  return new Promise((resolve) => {
    if (!socket) return resolve({ ok: false, error: 'Socket not connected' });
    if (!text || !text.trim()) return resolve({ ok: false, error: 'Empty text' });

    const localId = uuid();
    socket.emit('send', { liveStreamId, localId, text, type }, (ack) => {
      if (ack?.ok) {
        // Server will also broadcast 'new' to the room (including us),
        // with same localId to reconcile optimistic UI if needed.
        resolve({ ok: true, message: ack.message, localId });
      } else {
        resolve({ ok: false, error: ack?.error || 'send failed', localId });
      }
    });
  });
}

/**
 * Typing indicator
 * @param {string} liveStreamId
 * @param {boolean} isTyping
 */
export function setLiveTyping(liveStreamId, isTyping) {
  if (!socket) return;
  if (isTyping) socket.emit('typing', { liveStreamId });
  else socket.emit('typing:stop', { liveStreamId });
}

/** Access raw socket if you need it */
export function getLiveSocket() {
  return socket;
}
