const LiveStream = require('../models/LiveStream');
const LiveChatMessage = require('../models/LiveChatMessage');
const User = require('../models/User');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const { performance } = require('perf_hooks');

function secondsSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 1000);
}

function slog(ctx, msg, extra = {}) {
  const t = String(Math.round(performance.now())).padStart(6, ' ');
  console.log(`[live viewers ${t}ms] ${ctx} :: ${msg}`, extra);
}
function swarn(ctx, msg, extra = {}) {
  const t = String(Math.round(performance.now())).padStart(6, ' ');
  console.warn(`[live viewers ${t}ms] ${ctx} :: ${msg}`, extra);
}

function dedupeByUser(sockets) {
  const users = new Map();  // userId -> socket
  const guests = [];
  for (const s of sockets) {
    const uid = s.handshake?.auth?.userId;
    if (uid) { if (!users.has(uid)) users.set(uid, s); }
    else guests.push(s);
  }
  return { users, guests };
}

async function broadcastPresence(live, liveStreamId) {
   const sockets = await live.in(liveStreamId).fetchSockets();
   const { users, guests } = dedupeByUser(sockets);
   const viewerCount = sockets.length;
   const uniqueCount = users.size + guests.length;
   live.to(liveStreamId).emit('presence', { liveStreamId, viewerCount, uniqueCount });
   return { viewerCount, uniqueCount };
}

module.exports = function setupLiveNamespace(live) {
  live.on('connection', (socket) => {
    const userId = socket.user?.id;
    const byRoomRate = new Map();   // key: `${room}:${second}` -> count
    const lastSentAt = new Map();   // key: room -> last send timestamp (ms)
    const pendingPresence = new Map(); // room -> timeoutId

    async function computePresence(liveStreamId) {
      const sockets = await live.in(liveStreamId).fetchSockets(); // <— use `live`, not `nsp`
      const userIds = new Set();
      let guests = 0;
      for (const s of sockets) {
        const uid = s.user?.id || s.handshake?.auth?.userId; // prefer s.user from your auth
        if (uid) userIds.add(String(uid));
        else guests++;
      }
      return {
        viewerCount: sockets.length,          // total sockets (may include duplicates per user)
        uniqueCount: userIds.size + guests,   // unique users + guests
      };
    }

    function schedulePresence(room) {
      // debounce to avoid storms during bursts of joins/leaves
      if (pendingPresence.has(room)) return;
      const tid = setTimeout(async () => {
        pendingPresence.delete(room);
        try {
          const { viewerCount, uniqueCount } = await computePresence(room);
          live.to(room).emit('presence', { liveStreamId: room, viewerCount, uniqueCount });
        } catch (e) {
          // ignore
        }
      }, 150); // tweak if needed
      pendingPresence.set(room, tid);
    }

    /* ------------------------- JOIN / LEAVE ------------------------- */

    socket.on('join', async ({ liveStreamId } = {}, ack) => {
      try {
        if (!liveStreamId) throw new Error('Missing liveStreamId');
        const ls = await LiveStream.findById(liveStreamId).lean();
        if (!ls || !ls.isActive || ls.status !== 'live') throw new Error('Stream not live');
        if (ls.chat?.enabled === false) throw new Error('Chat disabled');
        if (ls.chat?.blockedUserIds?.some(b => String(b) === String(userId))) throw new Error('Blocked');
        if (ls.chat?.mode === 'followers' && String(userId) !== String(ls.hostUserId)) {
          // TODO: add real follower check if needed
          // throw new Error('Followers only');
        }

        socket.join(liveStreamId);
        socket.to(liveStreamId).emit('chat:system', { type: 'join', userId });
        // compute counts and ack with them
        const { viewerCount, uniqueCount } = await computePresence(liveStreamId);
        ack && ack({ ok: true, viewerCount, uniqueCount });
        // and broadcast presence to everyone in the room
        schedulePresence(liveStreamId);
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('leave', ({ liveStreamId } = {}, ack) => {
      if (liveStreamId) {
        socket.leave(liveStreamId);
        socket.to(liveStreamId).emit('chat:system', { type: 'leave', userId });
        schedulePresence(liveStreamId);
      }
      ack && ack({ ok: true });
    });

    // when this socket disconnects, broadcast presence for all rooms it was in
     socket.on('disconnecting', () => {
   for (const room of socket.rooms) {
     if (room !== socket.id) schedulePresence(room);
   }
 });

    /* --------------------------- SEND ------------------------------ */

    socket.on('send', async ({ liveStreamId, localId, text, type = 'message' } = {}, ack) => {
      try {
        if (!liveStreamId || !text?.trim()) throw new Error('Missing fields');

        const ls = await LiveStream.findById(liveStreamId).lean();
        if (!ls || !ls.isActive || ls.status !== 'live') throw new Error('Stream not live');
        if (ls.chat?.enabled === false) throw new Error('Chat disabled');
        if (ls.chat?.mutedUserIds?.some(m => String(m) === String(userId))) throw new Error('Muted');

        // Slow mode (per room)
        const slow = ls.chat?.slowModeSec || 0;
        if (slow > 0) {
          const key = `${liveStreamId}`;
          const last = lastSentAt.get(key) || 0;
          if (Date.now() - last < slow * 1000) {
            const waitMs = slow * 1000 - (Date.now() - last);
            throw new Error(`Slow mode: wait ${Math.ceil(waitMs / 1000)}s`);
          }
          lastSentAt.set(key, Date.now());
        }

        // Simple burst limit: >10 msgs/s from this socket into this room
        const nowSec = Math.floor(Date.now() / 1000);
        const rateKey = `${liveStreamId}:${nowSec}`;
        const count = (byRoomRate.get(rateKey) || 0) + 1;
        byRoomRate.set(rateKey, count);
        if (count > 10) throw new Error('Rate limited');

        // Compute replay offset
        const offsetSec = ls.startedAt ? secondsSince(ls.startedAt) : 0;

        // Persist
        const msg = await LiveChatMessage.create({
          liveStreamId,
          userId,
          userName: `${socket.user?.firstName} ${socket.user?.lastName}`,
          userPicUrl: socket.user?.profilePicUrl,
          type,
          text: String(text).slice(0, 500),
          offsetSec
        });

        await LiveStream.updateOne(
          { _id: liveStreamId },
          { $inc: { 'chat.messageCount': 1 }, $set: { 'chat.lastMessageAt': new Date() } }
        );

        const wire = {
          _id: String(msg._id),
          localId, // for optimistic reconcile
          liveStreamId,
          userId: String(msg.userId),
          userName: msg.userName,
          userPicUrl: msg.userPicUrl,
          type: msg.type,
          text: msg.text,
          offsetSec: msg.offsetSec,
          createdAt: msg.createdAt
        };

        socket.to(liveStreamId).emit('new', wire);
        ack && ack({ ok: true, message: wire });
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    /* ----------------------- MODERATION ---------------------------- */

    // Delete a message (host/mod only)
    socket.on('delete', async ({ liveStreamId, messageId } = {}, ack) => {
      try {
        if (!liveStreamId || !messageId) throw new Error('Missing fields');
        const ls = await LiveStream.findById(liveStreamId).lean();
        if (!ls) throw new Error('Not found');
        const isHost = String(ls.hostUserId) === String(userId);
        if (!isHost) throw new Error('Forbidden');

        await LiveChatMessage.updateOne(
          { _id: messageId },
          { $set: { deleted: true, hiddenBy: userId, reason: 'moderator' } }
        );

        live.to(liveStreamId).emit('deleted', { messageId });
        ack && ack({ ok: true });
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    // Pin / Unpin
    socket.on('pin', async ({ liveStreamId, messageId } = {}, ack) => {
      try {
        if (!liveStreamId || !messageId) throw new Error('Missing fields');
        const ls = await LiveStream.findById(liveStreamId);
        if (!ls) throw new Error('Not found');
        const isHost = String(ls.hostUserId) === String(userId);
        if (!isHost) throw new Error('Forbidden');

        ls.chat = ls.chat || {};
        ls.chat.pinnedMessageId = messageId;
        await ls.save();

        live.to(liveStreamId).emit('pinned', { messageId });
        ack && ack({ ok: true });
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('unpin', async ({ liveStreamId } = {}, ack) => {
      try {
        if (!liveStreamId) throw new Error('Missing liveStreamId');
        const ls = await LiveStream.findById(liveStreamId);
        if (!ls) throw new Error('Not found');
        const isHost = String(ls.hostUserId) === String(userId);
        if (!isHost) throw new Error('Forbidden');

        ls.chat = ls.chat || {};
        ls.chat.pinnedMessageId = null;
        await ls.save();

        live.to(liveStreamId).emit('unpinned', {});
        ack && ack({ ok: true });
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    /* -------------------------- TYPING ----------------------------- */

    // Optional typing indicators
    socket.on('typing', ({ liveStreamId } = {}) => {
      if (liveStreamId) {
        socket.to(liveStreamId).emit('typing', { userId });
      }
    });

    socket.on('typing:stop', ({ liveStreamId } = {}) => {
      if (liveStreamId) {
        socket.to(liveStreamId).emit('typing:stop', { userId });
      }
    });

    /* -------------------------- Viewers -----------------------------*/
    socket.on('viewers', async ({ liveStreamId }, cb) => {
      const ctx = `sid=${socket.id} room=${liveStreamId}`;
      const t0 = performance.now();
      try {
        if (!liveStreamId) {
          swarn(ctx, 'missing liveStreamId');
          return cb?.({ ok: false, error: 'missing liveStreamId' });
        }

        // Cross-node safe if Redis adapter is used
        const sockets = await live.in(liveStreamId).fetchSockets(); // <— fix variable
        slog(ctx, 'fetchSockets()', { nsp: socket.nsp, count: sockets.length });

        // Deduplicate by userId; collect guests
        const userSocketMap = new Map(); // userId -> socket
        const guestSockets = [];
        for (const s of sockets) {
          const uid = s.user?.id || s.handshake?.auth?.userId; // <— prefer s.user
          if (uid) {
            if (!userSocketMap.has(uid)) userSocketMap.set(uid, s);
          } else {
            guestSockets.push(s);
          }
        }
        slog(ctx, 'partitioned sockets', {
          uniqueUsers: userSocketMap.size,
          guestSockets: guestSockets.length,
        });

        const userIds = [...userSocketMap.keys()];
        const users = userIds.length
          ? await User.find({ _id: { $in: userIds } })
            .select('_id firstName lastName profilePic') // lean fields only
            .lean()
          : [];
        slog(ctx, 'loaded users', { loaded: users.length });

        const usersById = new Map(users.map(u => [String(u._id), u]));

        // Build viewer DTOs (presign only when a key exists)
        const userViewers = await Promise.all(
          userIds.map(async (uid) => {
            const u = usersById.get(String(uid));
            const s = userSocketMap.get(uid);

            const name =
              (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : s?.handshake?.auth?.name) ||
              'Viewer';

            const photoKey = u?.profilePic?.photoKey || u?.profilePic?.key;
            let avatarUrl = null;
            if (photoKey) {
              try {
                avatarUrl = await getPresignedUrl(photoKey);
              } catch (e) {
                swarn(ctx, 'presign failed', { uid: String(uid), photoKey, e: String(e) });
              }
            }

            return {
              id: String(uid),
              name,
              avatarUrl,
              isHost: !!s?.handshake?.auth?.isHost,
            };
          })
        );

        // Guests (no userId)
        const guestViewers = guestSockets.map((s) => ({
          id: s.id,
          name: s.handshake?.auth?.name || 'Viewer',
          avatarUrl: null,
          isHost: !!s.handshake?.auth?.isHost,
        }));

        const viewers = [...userViewers, ...guestViewers];
        const dur = Math.round(performance.now() - t0);

        slog(ctx, 'respond OK', {
          totalSockets: sockets.length,
          uniqueReturned: viewers.length,
          userViewers: userViewers.length,
          guestViewers: guestViewers.length,
          ms: dur,
          sample: viewers.slice(0, 2), // peek first 2
        });

        cb?.({
          ok: true,
          viewers,
          total: sockets.length,                            // total sockets
          unique: viewers.length,                           // unique entries returned
        });
      } catch (e) {
        const dur = Math.round(performance.now() - t0);
        swarn(ctx, 'respond FAIL', { ms: dur, e: String(e) });
        cb?.({ ok: false, error: e?.message || 'failed' });
      }
    });
  });
};
