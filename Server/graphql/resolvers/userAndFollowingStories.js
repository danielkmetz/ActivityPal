const User = require('../../models/User');
const Business = require('../../models/Business');
const { enrichStory } = require('../../utils/enrichStories');
const { enrichSharedPost, resolveUserProfilePics } = require('../../utils/userPosts');
const { resolveSharedPostData } = require('../../utils/resolveSharedPostType');

const userAndFollowingStories = async (_, { userId }, context) => {
  try {
    console.log('👋 Starting userAndFollowingStories for userId:', userId);

    const currentUserId = context?.user?._id || userId;
    console.log('🔍 currentUserId resolved to:', currentUserId);

    const user = await User.findById(userId)
      .select('firstName lastName profilePic stories following')
      .populate({
        path: 'following',
        select: 'firstName lastName profilePic stories',
      });

    if (!user) {
      console.error('❌ User not found:', userId);
      throw new Error('User not found');
    }

    const now = new Date();
    const usersToCheck = [user, ...(user.following || [])];
    console.log(`👥 Found ${usersToCheck.length} users to check for stories`);

    // Step 1: Collect originalOwner IDs for both Users and Businesses
    const userIdsToResolve = new Set();
    const userOwnerIds = new Set();
    const businessOwnerIds = new Set();

    for (const u of usersToCheck) {
      userIdsToResolve.add(u._id.toString());
      for (const story of u.stories || []) {
        if (
          new Date(story.expiresAt) > now &&
          story.visibility === 'public' &&
          story.originalOwner
        ) {
          userIdsToResolve.add(story.originalOwner.toString());

          if (story.originalOwnerModel === 'Business') {
            businessOwnerIds.add(story.originalOwner.toString());
          } else {
            userOwnerIds.add(story.originalOwner.toString());
          }
        }
      }
    }

    console.log('📸 Resolving profile pics for user IDs:', [...userIdsToResolve]);
    const profilePicMap = await resolveUserProfilePics([...userIdsToResolve]);
    console.log('✅ Profile pics resolved');

    // Step 2: Fetch all original owners in bulk
    const [userDocs, businessDocs] = await Promise.all([
      User.find({ _id: { $in: [...userOwnerIds] } })
        .select('firstName lastName profilePic profilePicUrl')
        .lean(),
      Business.find({ _id: { $in: [...businessOwnerIds] } })
        .select('businessName logoKey profilePic profilePicUrl')
        .lean()
    ]);

    const originalOwnerMap = new Map();
    for (const userDoc of userDocs) {
      originalOwnerMap.set(userDoc._id.toString(), { ...userDoc, __model: 'User' });
    }
    for (const bizDoc of businessDocs) {
      originalOwnerMap.set(bizDoc._id.toString(), { ...bizDoc, __model: 'Business' });
    }

    // Step 3: Group stories by uploader
    const groupedStoriesMap = new Map();

    for (const u of usersToCheck) {
      const uploaderId = u._id.toString();
      const uploaderProfile = profilePicMap[uploaderId] || {};

      const userInfo = {
        id: uploaderId,
        firstName: u.firstName,
        lastName: u.lastName,
        profilePicUrl: uploaderProfile.profilePicUrl || null,
      };

      for (const story of u.stories || []) {
        if (new Date(story.expiresAt) <= now || story.visibility !== 'public') continue;

        const isSharedPost = story.originalPostId && story.postType;
        const originalOwnerId = story.originalOwner?.toString();
        const originalOwner = originalOwnerMap.get(originalOwnerId) || null;

        let enrichedStory;

        if (isSharedPost) {
          const { original } = await resolveSharedPostData(
            story.postType,
            story.originalPostId
          );

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
              storyMeta: normalizedStory,
            },
            profilePicMap,
            null,
            currentUserId
          );

          const baseEnriched = await enrichStory(story, u, currentUserId, originalOwner);

          enrichedStory = {
            ...enrichedSharedStory,
            ...baseEnriched,
            _id: story._id,
            type: 'sharedStory',
            original: enrichedSharedStory.original,
          };

        } else {
          console.log('📝 Story is a regular story:', story._id);
          enrichedStory = await enrichStory(story, u, currentUserId, originalOwner);
          enrichedStory = {
            ...enrichedStory,
            type: 'story',
          };
        }

        if (!groupedStoriesMap.has(uploaderId)) {
          groupedStoriesMap.set(uploaderId, {
            _id: uploaderId,
            user: userInfo,
            profilePicUrl: userInfo.profilePicUrl,
            stories: [],
          });
        }

        groupedStoriesMap.get(uploaderId).stories.push(enrichedStory);
      }
    }

    const result = Array.from(groupedStoriesMap.values());
    console.log(`🎉 Returning ${result.length} grouped story sets`);
    return result;
  } catch (err) {
    console.error('🔥 Error in userAndFollowingStories resolver:', err);
    throw new Error('Failed to fetch stories');
  }
};

module.exports = {
  userAndFollowingStories,
};
