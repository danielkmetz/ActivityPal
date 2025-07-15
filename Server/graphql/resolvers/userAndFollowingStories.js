const User = require('../../models/User');
const { enrichStory } = require('../../utils/enrichStories');

const userAndFollowingStories = async (_, { userId }, context) => {
  try {
    const currentUserId = context?.user?._id || userId;

    const user = await User.findById(userId).populate('following');
    if (!user) throw new Error('User not found');

    const now = new Date();
    const usersToCheck = [user, ...(user.following || [])];
    const stories = [];

    for (const u of usersToCheck) {
      for (const story of u.stories || []) {
        if (new Date(story.expiresAt) > now && story.visibility === 'public') {
          const enriched = await enrichStory(story, u, currentUserId);
          stories.push(enriched);
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
