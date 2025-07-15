const User = require('../../models/User');
const { enrichStory } = require('../../utils/enrichStories');

const storiesByUser = async (_, { userId }, context) => {
  try {
    const currentUserId = context?.user?._id || null;

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const now = new Date();

    const stories = await Promise.all(
      (user.stories || [])
        .filter(story => new Date(story.expiresAt) > now && story.visibility === 'public')
        .map(story => enrichStory(story, user, currentUserId))
    );

    return stories;
  } catch (err) {
    console.error('Error in storiesByUser resolver:', err);
    throw new Error('Failed to fetch user stories');
  }
};

module.exports = {
  storiesByUser,
};
