const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyToken = require('../middleware/verifyToken');
const { getPresignedUrl } = require('../utils/cachePresignedUrl');
const deleteS3Objects = require('../utils/deleteS3Objects');
const { generatePresignedUrl } = require('../helpers/generatePresignedUrl');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const submitMediaConvertJob = require('../helpers/createMediaConvertJob');
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

    return res.status(200).json({
      message: 'Presigned upload URL generated.',
      mediaKey: singleMediaKey,
      uploadUrl: singleUploadUrl,
    });

  } catch (err) {
    console.error('❌ Failed to generate upload URL:', err);
    return res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('📥 Incoming story request');
    const {
      mediaType,
      caption,
      visibility,
      taggedUsers = [],
      segments = [],
    } = req.body;

    if (!mediaType || !['photo', 'video'].includes(mediaType)) {
      console.warn('⚠️ Invalid or missing mediaType:', mediaType);
      return res.status(400).json({ error: 'Invalid or missing mediaType' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      console.error(`❌ User not found: ${req.user.id}`);
      return res.status(404).json({ error: 'User not found' });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (mediaType === 'photo') {
      const fileName = `photo_${uuidv4()}.jpg`;
      const mediaKey = `stories/${fileName}`;

      console.log(`📸 Creating photo story: ${mediaKey}`);

      user.stories.push({ mediaKey, mediaType, caption, visibility, taggedUsers, expiresAt });
      await user.save();

      const mediaUrl = await getPresignedUrl(mediaKey);
      const profilePicUrl = user.profilePic?.photoKey
        ? await getPresignedUrl(user.profilePic.photoKey)
        : null;

      return res.status(201).json({
        message: 'Photo story created.',
        story: {
          ...user.stories[user.stories.length - 1].toObject(),
          mediaUploadUrl: uploadUrl,
          mediaUrl,
          profilePicUrl,
          user: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          isViewed: false,
          viewedBy: [],
        },
      });
    }

    if (!Array.isArray(segments) || segments.length === 0) {
      console.warn('⚠️ No video segments provided');
      return res.status(400).json({ error: 'Missing or invalid video segments' });
    }

    const mediaKeys = segments.map(s => s.mediaKey);
    const mergedFileName = `merged_${uuidv4()}.mp4`;
    const outputKey = `stories/${mergedFileName}`;
    const dbOutputKey = `${outputKey}.mp4`

    // 🔁 Submit MediaConvert job to merge
    const job = await submitMediaConvertJob(mediaKeys, outputKey);
    console.log('🛰️ MediaConvert job submitted:', job.Id);

    user.stories.push({
      mediaKey: dbOutputKey,
      mediaType: 'video',
      caption,
      visibility,
      taggedUsers,
      expiresAt,
    });

    await user.save();
    console.log('💾 Story saved to user');

    const createdStory = user.stories[user.stories.length - 1].toObject();
    const profilePicUrl = user.profilePic?.photoKey
      ? await getPresignedUrl(user.profilePic.photoKey)
      : null;

    const objectReady = await waitForObjectReady(BUCKET_NAME, dbOutputKey);
    if (!objectReady) {
      console.warn(`⚠️ Media file not ready in S3: ${dbOutputKey}`);
      return res.status(503).json({ error: 'Video not ready yet. Try again shortly.' });
    }
    const mediaUrl = await getPresignedUrl(dbOutputKey);

    console.log('✅ Returning merged video URL:', mediaUrl);

    return res.status(201).json({
      message: 'Video story created. MediaConvert job submitted.',
      story: {
        ...createdStory,
        mediaUrl,
        profilePicUrl,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        isViewed: false,
        viewedBy: [],
        jobId: job.Id,
        jobStatus: job.Status,
      },
    });
  } catch (err) {
    console.error('❌ Failed to process story:', err);
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

    console.log('🗑️ Removing story from DB...');
    user.stories.pull(storyId);
    await user.save();
    console.log('✅ Story removed from user');

    if (mediaKey) {
      console.log('🗑️ Deleting associated media from S3:', mediaKey);
      await deleteS3Objects([mediaKey]);
      console.log('✅ Media deleted from S3');
    }

    res.json({ message: 'Story deleted successfully' });
  } catch (err) {
    console.error('❌ Failed to delete story:', err);
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
