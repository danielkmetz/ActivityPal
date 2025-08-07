const User = require('../../models/User');
const { enrichStory } = require('../../utils/enrichStories');
const { getPresignedUrl } = require('../../utils/cachePresignedUrl');

const storiesByUser = async (_, { userId }, context) => {
  try {
    const currentUserId = context?.user?._id || null;

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const now = new Date();

    const validStories = (user.stories || []).filter(
      story => new Date(story.expiresAt) > now && story.visibility === 'public'
    );

    const enrichedStories = await Promise.all(
      validStories.map(story => enrichStory(story, user, currentUserId))
    );

    // Resolve profilePicUrl if not already on the user object
    let profilePicUrl = user.profilePicUrl || null;
    if (!profilePicUrl && user.profilePic?.photoKey) {
      profilePicUrl = await getPresignedUrl(user.profilePic.photoKey);
    }

    return {
      _id: user._id.toString(),
      user: {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicUrl,
      },
      profilePicUrl,
      stories: enrichedStories,
    };
  } catch (err) {
    console.error('Error in storiesByUser resolver:', err);
    throw new Error('Failed to fetch user stories');
  }
};

module.exports = {
  storiesByUser,
};
