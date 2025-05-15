const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const { generatePresignedUrl } = require('../helpers/generatePresignedUrl');
const { v4: uuidv4 } = require('uuid');

router.post('/', verifyToken, async (req, res) => {
  try {
    const { mediaType, caption, visibility, taggedUsers = [], fileName } = req.body;

    if (!fileName || !mediaType) {
      return res.status(400).json({ error: 'Missing required fields: fileName or mediaType' });
    }

    if (!['photo', 'video'].includes(mediaType)) {
      return res.status(400).json({ error: 'Invalid mediaType. Must be "photo" or "video"' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const extension = fileName.split('.').pop();
    const contentType = mediaType === 'video' ? `video/${extension}` : `image/${extension}`;
    const photoKey = `stories/${uuidv4()}_${fileName}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const uploadUrl = await generatePresignedUrl(photoKey /*, contentType */);

    user.stories.push({
      mediaKey: photoKey,
      mediaType,
      caption,
      visibility,
      taggedUsers,
      expiresAt,
    });

    await user.save();
    const createdStory = user.stories[user.stories.length - 1].toObject();

    res.status(201).json({
      message: 'Story created. Upload the file using mediaUploadUrl.',
      story: {
        ...createdStory,
        mediaUploadUrl: uploadUrl,
      },
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to create story' });
  }
});

// Edit a story and return the updated story
router.put('/:storyId', verifyToken, async (req, res) => {
  try {
    const { storyId } = req.params;
    const { caption, visibility, taggedUsers } = req.body;

    const user = await User.findById(req.user.id);
    const story = user.stories.id(storyId);

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (caption !== undefined) story.caption = caption;
    if (visibility !== undefined) story.visibility = visibility;
    if (taggedUsers !== undefined) story.taggedUsers = taggedUsers;

    await user.save();

    // Return the updated story as a plain JS object
    const updatedStory = story.toObject();
    res.json({ message: 'Story updated successfully', story: updatedStory });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update story' });
  }
});

// Delete a story
router.delete('/:storyId', verifyToken, async (req, res) => {
  try {
    const { storyId } = req.params;

    const user = await User.findById(req.user.id);
    const story = user.stories.id(storyId);

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    story.remove(); // Mongoose subdocument removal
    await user.save();

    res.json({ message: 'Story deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

module.exports = router;
