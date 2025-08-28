const router = require('express').Router();
const verifyToken = require('../middleware/verifyToken');
const LiveStream = require('../models/LiveStream');
const LiveChatMessage = require('../models/LiveChatMessage');

// POST /live/:id/chat
router.post('/live/:id/chat', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { text, type } = req.body;
  const userId = req.user._id;

  const ls = await LiveStream.findById(id).lean();
  if (!ls || !ls.isActive || ls.status !== 'live') return res.status(400).json({ message: 'Stream not live' });
  if (!ls.chat?.enabled) return res.status(403).json({ message: 'Chat disabled' });
  if (ls.chat.mode === 'followers' && !req.user.isFollowerOf(ls.hostUserId)) {
    return res.status(403).json({ message: 'Followers only' });
  }
  if (ls.chat.blockedUserIds?.some(b => String(b) === String(userId))) {
    return res.status(403).json({ message: 'Blocked' });
  }
  if (ls.chat.mutedUserIds?.some(m => String(m) === String(userId))) {
    return res.status(403).json({ message: 'Muted' });
  }

  // (Implement slow-mode checks with Redis in production)

  const offsetSec = ls.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(ls.startedAt).getTime()) / 1000)) : 0;

  const msg = await LiveChatMessage.create({
    liveStreamId: id,
    userId,
    text: String(text || '').slice(0, 500),
    type: type || 'message',
    offsetSec,
    userName: req.user.fullName,
    userPicUrl: req.user.profilePicUrl,
  });

  await LiveStream.updateOne(
    { _id: id },
    { $inc: { 'chat.messageCount': 1 }, $set: { 'chat.lastMessageAt': new Date() } }
  );

  // TODO: broadcast via WebSocket
  res.json({ message: msg });
});

// GET /live/:id/chat?after=<iso>&limit=50
router.get('/live/:id/chat', async (req, res) => {
  const { id } = req.params;
  const { after, limit = 50 } = req.query;

  const q = { liveStreamId: id, deleted: { $ne: true } };
  if (after) q.createdAt = { $gt: new Date(after) };

  const items = await LiveChatMessage.find(q)
    .sort({ createdAt: 1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean();

  res.json({ items });
});

// GET /live/:id/chat/replay?from=0&to=60
router.get('/live/:id/chat/replay', async (req, res) => {
  const { id } = req.params;
  const from = Math.max(0, parseInt(req.query.from || '0', 10));
  const to   = Math.max(from, parseInt(req.query.to || '60', 10));

  const items = await LiveChatMessage.find({
    liveStreamId: id,
    offsetSec: { $gte: from, $lte: to },
    deleted: { $ne: true }
  }).sort({ offsetSec: 1 }).lean();

  res.json({ items });
});

module.exports = router;
