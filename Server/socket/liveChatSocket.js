const LiveStream = require('../models/LiveStream');
const LiveChatMessage = require('../models/LiveChatMessage');

function secondsSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / 1000);
}

module.exports = function setupLiveNamespace(live) {
  live.on('connection', (socket) => {
    const userId = socket.user?._id;
    const byRoomRate = new Map();   // key: `${room}:${second}` -> count
    const lastSentAt = new Map();   // key: room -> last send timestamp (ms)

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
        ack && ack({ ok: true });
      } catch (e) {
        ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('leave', ({ liveStreamId } = {}, ack) => {
      if (liveStreamId) {
        socket.leave(liveStreamId);
        socket.to(liveStreamId).emit('chat:system', { type: 'leave', userId });
      }
      ack && ack({ ok: true });
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
          userName: socket.user?.fullName,
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

        live.to(liveStreamId).emit('new', wire);
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
  });
};
