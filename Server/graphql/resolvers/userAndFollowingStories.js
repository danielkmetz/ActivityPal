const User = require('../../models/User');
const { enrichStory } = require('../../utils/enrichStories');
const { enrichSharedPost, resolveUserProfilePics } = require('../../utils/userPosts');
const { resolveSharedPostData } = require('../../utils/resolveSharedPostType');

const userAndFollowingStories = async (_, { userId }, context) => {
  try {
    const currentUserId = context?.user?._id || userId;

    const user = await User.findById(userId).populate('following');
    if (!user) throw new Error('User not found');

    const now = new Date();
    const usersToCheck = [user, ...(user.following || [])];
    const stories = [];

    // Step 1: Gather all unique userIds for profile picture resolution
    const userIdsToResolve = new Set();
    for (const u of usersToCheck) {
      userIdsToResolve.add(u._id.toString());
      for (const story of u.stories || []) {
        if (
          new Date(story.expiresAt) > now &&
          story.visibility === 'public' &&
          story.originalOwnerModel === 'User' &&
          story.originalOwner
        ) {
          userIdsToResolve.add(story.originalOwner.toString());
        }
      }
    }

    const profilePicMap = await resolveUserProfilePics([...userIdsToResolve]);

    // Step 2: Enrich each story
    for (const u of usersToCheck) {
      for (const story of u.stories || []) {
        if (new Date(story.expiresAt) <= now || story.visibility !== 'public') continue;

        const isSharedPost = story.originalPostId && story.postType;
        const originalOwnerId = story.originalOwner?.toString();
        const originalOwner = profilePicMap?.[originalOwnerId];

        if (isSharedPost) {
          const { original } = await resolveSharedPostData(
            story.postType,
            story.originalPostId
          );

          // Guard against deleted or missing original post
          if (!original || !original._id) {
            console.warn(`⚠️ Skipping story with missing original post: ${story.originalPostId}`);
            continue;
          }

          const normalizedStory = {
            _id: story._id.toString?.() || story._id,
            mediaKey: story.mediaKey,
            mediaType: story.mediaType,
            caption: story.caption,
            visibility: story.visibility,
            expiresAt: story.expiresAt,
            viewedBy: story.viewedBy,
            originalPostId: story.originalPostId?.toString?.() || story.originalPostId,
            postType: story.postType,
            originalOwner: story.originalOwner?.toString?.() || story.originalOwner,
            originalOwnerModel: story.originalOwnerModel,
          };

          const enrichedSharedStory = await enrichSharedPost(
            {
              ...normalizedStory,
              original,
              user: u,
              storyMeta: normalizedStory, // for story-specific metadata
            },
            profilePicMap,
            null,
            currentUserId
          );

          console.log('story', story);
          console.log('original', original);

          const baseEnriched = await enrichStory(story, u, currentUserId, originalOwner);
          console.log('✅ Final shared story includes original:', !!enrichedSharedStory.original, enrichedSharedStory.original?._id);

          stories.push({
            ...enrichedSharedStory,
            ...baseEnriched,
            _id: story._id,
            type: 'sharedStory',
            original: enrichedSharedStory.original,
          });
        } else {
          const enriched = await enrichStory(story, u, currentUserId, originalOwner);
          stories.push({
            ...enriched,
            type: 'story',
          });
        }
      }
    }

    return stories;
  } catch (err) {
    console.error('Error in userAndFollowingStories resolver:', err);
    throw new Error('Failed to fetch stories');
  }
};

module.exports = {
  userAndFollowingStories,
};
