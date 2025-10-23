const { isBlockedEitherDirection } = require('../services/blockService');

async function ensureNotBlocked(req, res, next) {
  try {
    const me = req.user?.id;
    const { targetUserId } = req; // set this upstream based on the resource owner
    if (!me || !targetUserId) return res.status(400).json({ message: 'Missing users' });

    const blocked = await isBlockedEitherDirection(me, targetUserId);
    if (blocked) return res.status(403).json({ message: 'Interaction not allowed' });

    next();
  } catch (e) {
    res.status(500).json({ message: 'Block check failed' });
  }
}

module.exports = { ensureNotBlocked };
