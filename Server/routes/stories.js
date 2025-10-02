const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const deleteS3Objects = require('../utils/deleteS3Objects');
const { generatePresignedUrl } = require('../helpers/generatePresignedUrl');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const waitForObjectReady = require('../utils/waitForObjectReady');

const BUCKET_NAME = process.env.AWS_BUCKET_NAME_LOGOS;

router.post('/upload-url', verifyToken, async (req, res) => {
  try {
    const { fileName, fileNames = [], mediaType = 'photo' } = req.body;

    if (!fileName && !Array.isArray(fileNames)) {
      return res.status(400).json({ error: 'Provide fileName or fileNames[]' });
    }

    if (!['photo', 'video'].includes(mediaType)) {
      return res.status(400).json({ error: 'Invalid mediaType. Must be "photo" or "video"' });
    }

    // Handle multiple photo uploads
    if (Array.isArray(fileNames) && fileNames.length > 0) {
      const responses = await Promise.all(
        fileNames.map(async (name) => {
          const mediaKey = `stories/${uuidv4()}_${name}`;
          const uploadUrl = await generatePresignedUrl(mediaKey);
          return { fileName: name, mediaKey, uploadUrl };
        })
      );

      return res.status(200).json({
        message: 'Presigned URLs generated for photo array.',
        uploadData: responses,
      });
    }

    // Handle single upload (photo or video)
    const singleMediaKey = `stories/${uuidv4()}_${fileName}`;
    const singleUploadUrl = await generatePresignedUrl(singleMediaKey);
    console.log('single upload url', singleUploadUrl);

    return res.status(200).json({
      message: 'Presigned upload URL generated.',
      uploadData: {
        fileName,
        uploadUrl: singleUploadUrl,
        mediaKey: singleMediaKey,
      }
    });

  } catch (err) {
    console.error('❌ Failed to generate upload URL:', err);
    return res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      mediaType,
      captions = [],    // keep only as metadata if you want
      visibility = 'public',
      taggedUsers = [],
      mediaKey,
      segments = [],    // no longer used
    } = req.body;

    // Basic validation
    if (!['photo', 'video'].includes(mediaType)) {
      return res.status(400).json({ error: 'Invalid or missing mediaType' });
    }
    if (!mediaKey) {
      return res.status(400).json({ error: 'Missing mediaKey; client must upload a single composed file.' });
    }

    // (Optional, recommended) Enforce new contract
    if (Array.isArray(segments) && segments.length > 0) {
      return res.status(400).json({
        error: 'As of 2025-09-24, segments must be merged client-side; send only mediaKey.',
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Store story; keep captions only for photos (or as optional metadata)
    const storyDoc = {
      mediaKey,
      mediaType,
      visibility,
      taggedUsers,
      expiresAt,
      ...(mediaType === 'photo' ? { captions } : {}), // captions for video are burned-in already
    };

    user.stories.push(storyDoc);
    await user.save();

    // Ensure the uploaded object is available
    const ready = await waitForObjectReady(BUCKET_NAME, mediaKey);
    if (!ready) {
      return res.status(503).json({ error: 'Media not ready yet. Try again shortly.' });
    }

    const mediaUrl = await getPresignedUrl(mediaKey);
    const profilePicUrl = user.profilePic?.photoKey
      ? await getPresignedUrl(user.profilePic.photoKey)
      : null;

    const createdStory = user.stories[user.stories.length - 1].toObject();

    return res.status(201).json({
      message: 'Story created.',
      story: {
        ...createdStory,
        mediaUrl,
        profilePicUrl,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        isViewed: false,
        viewedBy: [],
      },
    });
  } catch (err) {
    console.error('❌ Failed to create story:', err);
    return res.status(500).json({ error: 'Failed to create story' });
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
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const story = user.stories.id(storyId);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const mediaKey = story.mediaKey;

    user.stories.pull(storyId);
    await user.save();

    if (mediaKey) {
      await deleteS3Objects([mediaKey]);
    }

    res.json({ message: 'Story deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

cron.schedule(
  '0 5 * * *',
  async () => {
    console.log('🧹 Running daily expired story cleanup...');

    try {
      const now = new Date();
      const users = await User.find({ 'stories.expiresAt': { $lt: now } });

      let totalDeleted = 0;
      let mediaKeysToDelete = [];

      for (const user of users) {
        const originalLength = user.stories.length;

        // Filter stories to keep
        const activeStories = user.stories.filter(
          story => story.expiresAt > now
        );

        // Determine deleted stories
        const expiredStories = user.stories.filter(
          story => story.expiresAt <= now
        );

        mediaKeysToDelete.push(...expiredStories.map(s => s.mediaKey));

        // Replace stories with only active ones
        user.stories = activeStories;
        await user.save();

        totalDeleted += originalLength - activeStories.length;
      }

      if (mediaKeysToDelete.length > 0) {
        console.log('🗑️ Deleting expired media from S3:', mediaKeysToDelete);
        await deleteS3Objects(mediaKeysToDelete);
        console.log('✅ S3 media deleted.');
      }

      console.log(`✅ Cleanup complete. Users affected: ${users.length}, Stories removed: ${totalDeleted}`);
    } catch (err) {
      console.error('❌ Error during story cleanup:', err);
    }
  },
  {
    timezone: 'Etc/UTC',
  }
);

module.exports = router;
