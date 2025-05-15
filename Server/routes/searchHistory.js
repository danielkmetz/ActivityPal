const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

//add new search
router.post('/:userId/searches', async (req, res) => {
  const { userId } = req.params;
  const { query } = req.body;

  if (!query) return res.status(400).json({ error: 'Search query is required' });

  try {
    const currentUser = await User.findById(userId);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const searchedUser = await User.findById(query); // assumes query is userId
    if (!searchedUser) return res.status(404).json({ error: 'Searched user not found' });

    const fullName = `${searchedUser.firstName} ${searchedUser.lastName}`;

    // Remove any duplicate
    currentUser.recentSearches = currentUser.recentSearches.filter(
      item => item.userId.toString() !== query
    );

    // Generate a new queryId
    const queryId = new mongoose.Types.ObjectId();

    // Push new search to the top
    currentUser.recentSearches.unshift({
      queryId,
      userId: searchedUser._id,
      fullName,
    });

    // Trim to max 10
    currentUser.recentSearches = currentUser.recentSearches.slice(0, 10);
    await currentUser.save();

    // Generate presigned URL if available
    let profilePicUrl = null;
    const key = searchedUser.profilePic?.photoKey;
    if (key) {
      profilePicUrl = await getPresignedUrl(key);
    }

    res.json({
      success: true,
      recentSearch: {
        queryId,
        userId: searchedUser._id,
        fullName,
        searchedAt: new Date(),
        profilePicUrl,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// get recent searches with profile pics
router.get('/:userId/searches', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId)
      .populate({
        path: 'recentSearches.userId',
        select: 'firstName lastName profilePic',
      })
      .select('recentSearches');

    if (!user) return res.status(404).json({ error: 'User not found' });

    const enrichedSearches = await Promise.all(
      user.recentSearches.map(async (item) => {
        const searchedUser = item.userId;

        let profilePicUrl = null;
        if (searchedUser?.profilePic?.photoKey) {
          profilePicUrl = await getPresignedUrl(searchedUser.profilePic.photoKey);
        }

        return {
          queryId: item.queryId,
          userId: searchedUser?._id,
          fullName: `${searchedUser?.firstName || ''} ${searchedUser?.lastName || ''}`.trim(),
          searchedAt: item.searchedAt,
          profilePicUrl,
        };
      })
    );

    res.json(enrichedSearches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

//delete single searches
router.delete('/:userId/searches/:queryId', async (req, res) => {
  const { userId, queryId } = req.params;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { recentSearches: { queryId } } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, recentSearches: user.recentSearches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

//delete all searches
router.delete('/:userId/searches', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { recentSearches: [] } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, recentSearches: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router
