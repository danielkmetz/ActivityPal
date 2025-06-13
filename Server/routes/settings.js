const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

// 🔧 PATCH: Update user privacy settings (partial updates only)
router.patch('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    const allowedFields = ['profileVisibility', 'invites', 'contentVisibility', 'tagPermissions', 'messagePermissions'];
    for (const key in updates) {
      if (!allowedFields.includes(key)) {
        return res.status(400).json({ error: `Invalid field: ${key}` });
      }
    }

    // Construct update object for nested privacySettings fields
    const updateFields = {};
    for (const [key, value] of Object.entries(updates)) {
      updateFields[`privacySettings.${key}`] = value;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('privacySettings');

    res.json(updatedUser.privacySettings);
  } catch (err) {
    console.error('PATCH /user-settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
