const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const { blockUser, unblockUser, getBlockSets } = require('../services/blockService');

router.use(verifyToken);

// POST /blocks/:targetId — block
router.post('/:targetId', async (req, res) => {
  try {
    const blockerId = req.user.id;
    const { targetId } = req.params;
    await blockUser(blockerId, targetId);
    res.json({ message: 'Blocked', targetId });
  } catch (e) {
    res.status(400).json({ message: e.message || 'Failed to block' });
  }
});

// DELETE /blocks/:targetId — unblock
router.delete('/:targetId', async (req, res) => {
  try {
    const blockerId = req.user.id;
    const { targetId } = req.params;
    await unblockUser(blockerId, targetId);
    res.json({ message: 'Unblocked', targetId });
  } catch (e) {
    res.status(400).json({ message: e.message || 'Failed to unblock' });
  }
});

// GET /blocks/me — who I block and who blocks me
router.get('/me', async (req, res) => {
  try {
    const { blockedIds, blockedByIds } = await getBlockSets(req.user.id);
    res.json({
      blocked: Array.from(blockedIds),
      blockedBy: Array.from(blockedByIds),
    });
  } catch (e) {
    res.status(400).json({ message: e.message || 'Failed to list blocks' });
  }
});

module.exports = router;
