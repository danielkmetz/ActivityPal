const LiveStream = require('../models/LiveStream');
const LiveChatMessage = require('../models/LiveChatMessage');
const User = require('../models/User');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const { performance } = require('perf_hooks');

function secondsSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 1000);
}
function sanitizeLiveDoc(doc = {}) {
  const {
    _id, id, hostUserId, title, playbackUrl, createdAt, placeId,
    thumbnailUrl, isActive, status, host
  } = doc || {};
  return {
    _id: String(_id || id || ''),
    hostUserId,
    title,
    playbackUrl,
    createdAt,
    placeId,
    thumbnailUrl,
    isActive,
    status,
    ...(host ? { host } : {}),
  };
}

async function shapeLiveForWire(liveDoc) {
  const base = sanitizeLiveDoc(liveDoc);

  // Detect if hostUserId was populated or is just an id
  const hostId =
    (typeof liveDoc.hostUserId === 'object' && liveDoc.hostUserId?._id)
      ? String(liveDoc.hostUserId._id)
      : (liveDoc.hostUserId ? String(liveDoc.hostUserId) : null);

  let firstName = '';
  let lastName = '';
  let profilePicUrl = null;

  if (hostId) {
    // If already populated, prefer those fields to avoid an extra query
    if (typeof liveDoc.hostUserId === 'object') {
      firstName = liveDoc.hostUserId.firstName || '';
      lastName = liveDoc.hostUserId.lastName || '';
      const photoKey =
        liveDoc.hostUserId.profilePic?.photoKey || liveDoc.hostUserId.profilePic?.key || null;
      if (photoKey) {
        try { profilePicUrl = await getPresignedUrl(photoKey); } catch (_) {}
      }
    } else {
      // Fetch minimal host and sign pic
      const host = await User.findById(hostId)
        .select('firstName lastName profilePic')
        .lean();
      if (host) {
        firstName = host.firstName || '';
        lastName = host.lastName || '';
        const photoKey = host.profilePic?.photoKey || host.profilePic?.key || null;
        if (photoKey) {
          try { profilePicUrl = await getPresignedUrl(photoKey); } catch (_) {}
        }
      }
    }
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    ...base,
    hostUserId: hostId || null, // keep id on the root (matches /live/now)
    host: {
      firstName,
      lastName,
      fullName,
      profilePicUrl,
    },
  };
}

module.exports = function setupLiveNamespace(live) {
  // ---- define the bus OUTSIDE of the connection handler ----
  const bus = {
    async emitLiveStarted(liveDoc, meta = {}) {
      const t0 = performance.now();
      const id = String(liveDoc?._id || liveDoc?.id || '');
      try {
        const payload = liveDoc.host ? liveDoc : shapeLiveForWire(liveDoc);
        live.emit('live:started', sanitizeLiveDoc(payload));
      } catch (e) {
        console.warn('[liveBus] ✖ live:started broadcast failed', { id, err: e?.message });
      }
    },

    async emitLiveEnded(liveId, meta = {}) {
      const t0 = performance.now();
      const id = String(liveId || '');
      try {
        let roomSockets = null;
        try {
          const sockets = await live.in(id).fetchSockets();
          roomSockets = sockets.length;
        } catch (e) {
          console.warn('[liveBus] fetchSockets failed (adapter?)', { id, err: e?.message });
        }

        live.emit('live:ended', { liveId: id });
        live.to(id).emit('live:ended', { liveId: id });
      } catch (e) {
        console.warn('[liveBus] ✖ live:ended broadcast failed', { id, err: e?.message });
      }
    },
  };

  // ---- wire up all your per-socket handlers as before ----
  live.on('connection', (socket) => {
    const userId = socket.user?.id;
    const byRoomRate = new Map();
    const lastSentAt = new Map();
    const pendingPresence = new Map();

    async function computePresence(liveStreamId) {
      const sockets = await live.in(liveStreamId).fetchSockets();
      const userIds = new Set();
      let guests = 0;
      for (const s of sockets) {
        const uid = s.user?.id || s.handshake?.auth?.userId;
        if (uid) userIds.add(String(uid));
        else guests++;
      }
      return {
        viewerCount: sockets.length,
        uniqueCount: userIds.size + guests,
      };
    }

    function schedulePresence(room) {
      if (pendingPresence.has(room)) return;
      const tid = setTimeout(async () => {
        pendingPresence.delete(room);
        try {
          const { viewerCount, uniqueCount } = await computePresence(room);
          live.to(room).emit('presence', { liveStreamId: room, viewerCount, uniqueCount });
        } catch (_) {}
      }, 150);
      pendingPresence.set(room, tid);
    }

    // JOIN
    socket.on('join', async ({ liveStreamId } = {}, ack) => {
      try {
        if (!liveStreamId) throw new Error('Missing liveStreamId');
        const ls = await LiveStream.findById(liveStreamId).lean();
        if (!ls || !ls.isActive || ls.status !== 'live') throw new Error('Stream not live');
        if (ls.chat?.enabled === false) throw new Error('Chat disabled');
        if (ls.chat?.blockedUserIds?.some(b => String(b) === String(userId))) throw new Error('Blocked');

        socket.join(liveStreamId);
        socket.to(liveStreamId).emit('chat:system', { type: 'join', userId });

        const { viewerCount, uniqueCount } = await computePresence(liveStreamId);
        ack && ack({ ok: true, viewerCount, uniqueCount });
        schedulePresence(liveStreamId);
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    // LEAVE
    socket.on('leave', ({ liveStreamId } = {}, ack) => {
      if (liveStreamId) {
        socket.leave(liveStreamId);
        socket.to(liveStreamId).emit('chat:system', { type: 'leave', userId });
        schedulePresence(liveStreamId);
      }
      ack && ack({ ok: true });
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) schedulePresence(room);
      }
    });

    // SEND
    socket.on('send', async ({ liveStreamId, localId, text, type = 'message' } = {}, ack) => {
      try {
        if (!liveStreamId || !text?.trim()) throw new Error('Missing fields');

        const ls = await LiveStream.findById(liveStreamId).lean();
        if (!ls || !ls.isActive || ls.status !== 'live') throw new Error('Stream not live');
        if (ls.chat?.enabled === false) throw new Error('Chat disabled');
        if (ls.chat?.mutedUserIds?.some(m => String(m) === String(userId))) throw new Error('Muted');

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

        const nowSec = Math.floor(Date.now() / 1000);
        const rateKey = `${liveStreamId}:${nowSec}`;
        const count = (byRoomRate.get(rateKey) || 0) + 1;
        byRoomRate.set(rateKey, count);
        if (count > 10) throw new Error('Rate limited');

        const offsetSec = ls.startedAt ? secondsSince(ls.startedAt) : 0;

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
          localId,
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

    // MODERATION (delete/pin/unpin)
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

    // TYPING
    socket.on('typing', ({ liveStreamId } = {}) => {
      if (liveStreamId) socket.to(liveStreamId).emit('typing', { userId });
    });
    socket.on('typing:stop', ({ liveStreamId } = {}) => {
      if (liveStreamId) socket.to(liveStreamId).emit('typing:stop', { userId });
    });

    // VIEWERS
    socket.on('viewers', async ({ liveStreamId }, cb) => {
      const t0 = performance.now();
      try {
        if (!liveStreamId) return cb?.({ ok: false, error: 'missing liveStreamId' });

        const sockets = await live.in(liveStreamId).fetchSockets();

        const userSocketMap = new Map();
        const guestSockets = [];
        for (const s of sockets) {
          const uid = s.user?.id || s.handshake?.auth?.userId;
          if (uid) {
            if (!userSocketMap.has(uid)) userSocketMap.set(uid, s);
          } else {
            guestSockets.push(s);
          }
        }

        const userIds = [...userSocketMap.keys()];
        const users = userIds.length
          ? await User.find({ _id: { $in: userIds } }).select('_id firstName lastName profilePic').lean()
          : [];
        const usersById = new Map(users.map(u => [String(u._id), u]));

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
              try { avatarUrl = await getPresignedUrl(photoKey); } catch (_) {}
            }

            return {
              id: String(uid),
              name,
              avatarUrl,
              isHost: !!s?.handshake?.auth?.isHost,
            };
          })
        );

        const guestViewers = guestSockets.map((s) => ({
          id: s.id,
          name: s.handshake?.auth?.name || 'Viewer',
          avatarUrl: null,
          isHost: !!s.handshake?.auth?.isHost,
        }));

        const viewers = [...userViewers, ...guestViewers];
        const dur = Math.round(performance.now() - t0);

        cb?.({
          ok: true,
          viewers,
          total: sockets.length,
          unique: viewers.length,
          ms: dur,
        });
      } catch (e) {
        cb?.({ ok: false, error: e?.message || 'failed' });
      }
    });
  });

  return bus; // <-- NOW it actually returns a bus
};
