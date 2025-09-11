const LiveStream = require('../models/LiveStream');
const LiveChatMessage = require('../models/LiveChatMessage');
const User = require('../models/User');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const { ok, fail } = require('../utils/liveChat/acks');

function secondsSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 1000);
}

function registerHandlers({ nsp, socket, presence }) {
  const userId = socket.user?.id;
  const byRoomRate = new Map();
  const lastSentAt = new Map();

  function requireLive(ls) {
    if (!ls || !ls.isActive || ls.status !== 'live') throw new Error('Stream not live');
    if (ls.chat?.enabled === false) throw new Error('Chat disabled');
    if (ls.chat?.blockedUserIds?.some(b => String(b) === String(userId))) throw new Error('Blocked');
  }

  // JOIN
  socket.on('join', async ({ liveStreamId } = {}, ack) => {
    try {
      if (!liveStreamId) throw new Error('Missing liveStreamId');
      const ls = await LiveStream.findById(liveStreamId).lean();
      requireLive(ls);

      socket.join(liveStreamId);
      socket.to(liveStreamId).emit('chat:system', { type: 'join', userId });

      // 👇 immediate counts for ACK (match old behavior)
      const snap = await presence.readSnapshot(liveStreamId); // { current, unique, peak }
      ok(ack, { viewerCount: snap.current, uniqueCount: snap.unique });

      // still debounce a public presence push for everyone
      presence.scheduleRecompute(liveStreamId);
    } catch (e) {
      fail(ack, e.message);
    }
  });

  // LEAVE
  socket.on('leave', ({ liveStreamId } = {}, ack) => {
    try {
      if (!liveStreamId) throw new Error('Missing liveStreamId');
      socket.leave(liveStreamId);
      socket.to(liveStreamId).emit('chat:system', { type: 'leave', userId });
      presence.scheduleRecompute(liveStreamId);
      ok(ack, { left: true });
    } catch (e) { fail(ack, e.message); }
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) presence.scheduleRecompute(room);
    }
  });

  // SEND
  // Per-sender slow mode + per-sender, per-room, per-second rate limit
  socket.on('send', async ({ liveStreamId, localId, text, type = 'message' } = {}, ack) => {
    try {
      if (!liveStreamId || !String(text || '').trim()) throw new Error('Missing fields');

      const ls = await LiveStream.findById(liveStreamId).lean();
      requireLive(ls);

      // --- Slow mode (per sender in this room) ---
      const slow = ls.chat?.slowModeSec || 0;
      if (slow > 0) {
        const slowKey = `${liveStreamId}:${userId || socket.id}`;
        const last = lastSentAt.get(slowKey) || 0;
        const elapsed = Date.now() - last;
        if (elapsed < slow * 1000) {
          const waitMs = slow * 1000 - elapsed;
          throw new Error(`Slow mode: wait ${Math.ceil(waitMs / 1000)}s`);
        }
        lastSentAt.set(slowKey, Date.now());
      }

      // --- Rate limit (per sender, per room, per second) ---
      const nowSec = Math.floor(Date.now() / 1000);
      const rateKey = `${liveStreamId}:${userId || socket.id}:${nowSec}`;
      byRoomRate.set(rateKey, (byRoomRate.get(rateKey) || 0) + 1);
      if (byRoomRate.get(rateKey) > 10) throw new Error('Rate limited');

      // --- Persist message ---
      const offsetSec = ls.startedAt ? secondsSince(ls.startedAt) : 0;

      const msg = await LiveChatMessage.create({
        liveStreamId,
        userId,
        userName: `${socket.user?.firstName || ''} ${socket.user?.lastName || ''}`.trim(),
        userPicUrl: socket.user?.profilePicUrl || null,
        type,
        text: String(text).slice(0, 500),
        offsetSec,
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
        createdAt: msg.createdAt,
      };

      socket.to(liveStreamId).emit('new', wire);
      ok(ack, { message: wire });
    } catch (e) {
      fail(ack, e.message);
    }
  });

  // MODERATION
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

      nsp.to(liveStreamId).emit('deleted', { messageId });
      ok(ack);
    } catch (e) { fail(ack, e.message); }
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

      nsp.to(liveStreamId).emit('pinned', { messageId });
      ok(ack);
    } catch (e) { fail(ack, e.message); }
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

      nsp.to(liveStreamId).emit('unpinned', {});
      ok(ack);
    } catch (e) { fail(ack, e.message); }
  });

  // TYPING
  socket.on('typing', ({ liveStreamId } = {}) => {
    if (liveStreamId) socket.to(liveStreamId).emit('typing', { userId });
  });
  socket.on('typing:stop', ({ liveStreamId } = {}) => {
    if (liveStreamId) socket.to(liveStreamId).emit('typing:stop', { userId });
  });

  // VIEWERS (keep your current richer viewer list)
  socket.on('viewers', async ({ liveStreamId }, cb) => {
    const t0 = Date.now();
    try {
      if (!liveStreamId) return cb?.({ ok: false, error: 'missing liveStreamId' });
      const sockets = await nsp.in(liveStreamId).fetchSockets();

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

      const userViewers = await Promise.all(userIds.map(async (uid) => {
        const u = usersById.get(String(uid));
        const s = userSocketMap.get(uid);
        const name =
          (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : s?.handshake?.auth?.name) || 'Viewer';

        const photoKey = u?.profilePic?.photoKey || u?.profilePic?.key;
        let avatarUrl = null;
        if (photoKey) {
          try { avatarUrl = await getPresignedUrl(photoKey); } catch (_) { }
        }

        return {
          id: String(uid),
          name,
          avatarUrl,
          isHost: !!s?.handshake?.auth?.isHost,
        };
      }));

      const guestViewers = guestSockets.map((s) => ({
        id: s.id,
        name: s.handshake?.auth?.name || 'Viewer',
        avatarUrl: null,
        isHost: !!s.handshake?.auth?.isHost,
      }));

      const viewers = [...userViewers, ...guestViewers];
      const dur = Date.now() - t0;

      cb?.({ ok: true, viewers, total: sockets.length, unique: viewers.length, ms: dur });
    } catch (e) { cb?.({ ok: false, error: e?.message || 'failed' }); }
  });
}

module.exports = { registerHandlers };
