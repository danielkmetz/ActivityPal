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

        if (isSharedPost) {
          const { original, originalOwner, originalOwnerModel } = await resolveSharedPostData(
            story.postType,
            story.originalPostId
          );

          const enrichedSharedStory = await enrichSharedPost({
            user: u._id,
            originalOwner,
            originalOwnerModel,
            postType: story.postType,
            originalPostId: story.originalPostId,
            original,
            storyMeta: {
              _id: story._id,
              caption: story.caption,
              mediaType: story.mediaType,
              expiresAt: story.expiresAt,
              visibility: story.visibility,
              viewedBy: story.viewedBy,
              mediaKey: story.mediaKey,
            },
          }, profilePicMap, u, currentUserId);

          const baseEnriched = await enrichStory(story, u, currentUserId, profilePicMap);

          stories.push({
            ...baseEnriched,
            ...enrichedSharedStory,
            _id: story._id,
            type: 'sharedStory',
          });
        } else {
          const enriched = await enrichStory(story, u, currentUserId, profilePicMap);
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
