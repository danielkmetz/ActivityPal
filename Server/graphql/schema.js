const { ApolloServer } = require('@apollo/server');
const mongoose = require('mongoose');
const User = require('../models/User'); // Import User Model
const Business = require('../models/Business'); // Import Review Model
const Review = require('../models/Reviews.js');
const CheckIn = require('../models/CheckIns.js');
const ActivityInvite = require('../models/ActivityInvites.js');
const depthLimit = require('graphql-depth-limit');
const typeDefs = require('./typeDefs.js');
const { GraphQLScalarType, Kind } = require('graphql');
const { getCheckInsByPlaceId } = require('../utils/getCheckInsByPlaceId.js');
const { getUserFromToken } = require('../utils/auth.js');
const { gatherUserReviews, gatherUserCheckIns, enrichComments, resolveTaggedPhotoUsers, resolveTaggedUsers, resolveUserProfilePics } = require('../utils/userPosts.js');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const { enrichStory } = require('../utils/enrichStories.js');

// ✅ Custom Scalar Type for Date
const DateScalar = new GraphQLScalarType({
  name: "Date",
  description: "Custom scalar type for Date values",
  serialize(value) {
    return new Date(value).toISOString(); // Convert MongoDB timestamps to ISO format
  },
  parseValue(value) {
    return new Date(value); // Convert input value to Date object
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.INT) {
      return new Date(parseInt(ast.value, 10)); // Convert string to Date object
    }
    return null;
  }
});

const populateRepliesRecursively = async (comments, depth = 0, maxDepth = 5) => {
  if (!comments || comments.length === 0) return [];

  if (depth >= maxDepth) return [];  // ✅ Limit recursion depth

  return comments.map((comment) => ({
    ...comment,
    replies: populateRepliesRecursively(comment.replies, depth + 1, maxDepth)  // ✅ Recursively process embedded replies
  }));
};

const resolvers = {
  Query: {
    getUserAndFollowingReviews: async (_, { userId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error("Invalid userId format");
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);

        // 🔍 Get user's following list
        const user = await User.findById(userObjectId)
          .select('following')
          .lean();

        if (!user) {
          throw new Error("User not found");
        }

        const following = user.following || [];
        const allUserIds = [userObjectId, ...following];
        
        // 👤 Get user names and profile photos
        const users = await User.find({ _id: { $in: allUserIds } })
          .select('_id firstName lastName profilePic')
          .lean();

        const picMap = await resolveUserProfilePics(allUserIds);
        
        // 🧠 Enrich each user's reviews using the helper
        const allReviewsNested = await Promise.all(
          users.map(async (user) => {
            const userIdStr = user._id.toString();
            const profileMeta = picMap[userIdStr] || {};
            console.log(`🔧 Gathering reviews for user ${userIdStr}`);
            return gatherUserReviews(user._id, profileMeta.profilePic, profileMeta.profilePicUrl);
          })
        );

        const allReviews = allReviewsNested.flat();
        
        // 🕒 Sort by latest date
        const sorted = allReviews
          .filter(Boolean)
          .sort((a, b) => new Date(b.date) - new Date(a.date));

        return sorted;

      } catch (error) {
        throw new Error("Failed to fetch user and following reviews");
      }
    },
    getUserPosts: async (_, { userId, limit = 15, after }) => {
      try {
        const userObjectId = new mongoose.Types.ObjectId(userId);

        const user = await User.findById(userObjectId).select(
          '_id profilePic firstName lastName'
        );

        if (!user) {
          console.warn('⚠️ User not found for ID:', userId);
          throw new Error('User not found');
        }

        const photoKey = user.profilePic?.photoKey || null;
        const profilePicUrl = photoKey
          ? await getPresignedUrl(photoKey)
          : null;

        const reviews = await gatherUserReviews(userObjectId, user.profilePic, profilePicUrl);

        const checkIns = await gatherUserCheckIns(user, profilePicUrl);

        const allPosts = [...reviews, ...checkIns].map(post => ({
          ...post,
          sortDate: post.date,
        }));

        let sorted = allPosts.sort((a, b) => {
          const dateDiff = new Date(b.sortDate) - new Date(a.sortDate);
          if (dateDiff !== 0) return dateDiff;
          return new mongoose.Types.ObjectId(b._id).toString().localeCompare(
            new mongoose.Types.ObjectId(a._id).toString()
          );
        });

        if (after?.sortDate && after?.id) {
          const afterTime = new Date(after.sortDate).getTime();
          const afterObjectId = new mongoose.Types.ObjectId(after.id).toString();

          sorted = sorted.filter(post => {
            const postTime = new Date(post.sortDate).getTime();
            const postId = new mongoose.Types.ObjectId(post._id).toString();

            return (
              postTime < afterTime ||
              (postTime === afterTime && postId < afterObjectId)
            );
          });

        }

        const result = sorted.slice(0, limit);
        return result;
      } catch (error) {
        console.error('[❌ Resolver Error] getUserPosts failed:', error);
        throw new Error(`[Resolver Error] ${error.message}`);
      }
    },
    getBusinessReviews: async (_, { placeId, limit = 15, after }) => {
      try {
        if (!placeId) throw new Error("Invalid placeId");

        const business = await Business.findOne({ placeId }).lean();
        if (!business) return [];

        const businessName = business.businessName;

        // 🔍 Build query filter
        const baseFilter = { placeId };

        // ✨ Fetch and enrich REVIEWS
        const reviewsRaw = await Review.find(baseFilter).lean();
        const reviewUserIds = reviewsRaw.map(r => r.userId?.toString());
        const reviewPicMap = await resolveUserProfilePics(reviewUserIds);

        const enrichedReviews = await Promise.all(
          reviewsRaw.map(async (review) => {
            const taggedUsers = await resolveTaggedUsers(review.taggedUsers || []);
            const rawPhotos = await resolveTaggedPhotoUsers(review.photos || []);
            const photos = rawPhotos.filter(p => p?.photoKey);
            const enrichedComments = enrichComments(review.comments || []);

            return {
              __typename: 'Review',
              ...review,
              type: 'review',
              businessName,
              sortDate: new Date(review.date).toISOString(),
              date: new Date(review.date).toISOString(),
              profilePic: reviewPicMap[review.userId?.toString()]?.profilePic || null,
              profilePicUrl: reviewPicMap[review.userId?.toString()]?.profilePicUrl || null,
              taggedUsers,
              comments: enrichedComments,
              photos,
            };
          })
        );

        // ✨ Fetch and enrich CHECK-INS
        const checkInsRaw = await CheckIn.find(baseFilter).lean();
        const checkInUserIds = checkInsRaw.map(ci => ci.userId?.toString());
        const checkInPicMap = await resolveUserProfilePics(checkInUserIds);

        const enrichedCheckIns = await Promise.all(
          checkInsRaw.map(async (checkIn) => {
            const taggedUsers = await resolveTaggedUsers(checkIn.taggedUsers || []);
            const rawPhotos = await resolveTaggedPhotoUsers(checkIn.photos || []);
            const enrichedComments = enrichComments(checkIn.comments || []);
            const photos = rawPhotos.filter(p => p?.photoKey);

            return {
              __typename: 'CheckIn',
              ...checkIn,
              type: 'check-in',
              businessName,
              sortDate: new Date(checkIn.date).toISOString(),
              date: new Date(checkIn.date).toISOString(),
              profilePic: checkInPicMap[checkIn.userId?.toString()]?.profilePic || null,
              profilePicUrl: checkInPicMap[checkIn.userId?.toString()]?.profilePicUrl || null,
              comments: enrichedComments,
              taggedUsers,
              photos,
            };
          })
        );

        // 📦 Combine and sort by `sortDate` + `_id`
        let allPosts = [...enrichedReviews, ...enrichedCheckIns];

        allPosts.sort((a, b) => {
          const dateDiff = new Date(b.sortDate) - new Date(a.sortDate);
          if (dateDiff !== 0) return dateDiff;

          return new mongoose.Types.ObjectId(b._id).toString().localeCompare(
            new mongoose.Types.ObjectId(a._id).toString()
          );
        });

        // ⏭️ Pagination logic
        if (after?.sortDate && after?.id) {
          const afterTime = new Date(after.sortDate).getTime();
          const afterId = new mongoose.Types.ObjectId(after.id).toString();

          allPosts = allPosts.filter(post => {
            const postTime = new Date(post.sortDate).getTime();
            const postId = new mongoose.Types.ObjectId(post._id).toString();
            return (
              postTime < afterTime ||
              (postTime === afterTime && postId < afterId)
            );
          });
        }

        return allPosts.slice(0, limit);
      } catch (error) {
        console.error("❌ Error in getBusinessReviews:", error);
        throw new Error("Failed to fetch business reviews");
      }
    },
    getUserAndFollowingCheckIns: async (_, { userId }) => {
      try {
        // 🧱 Validate input
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error("Invalid userId format");
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);

        // 👥 Fetch following list
        const user = await User.findById(userObjectId).select('following').lean();
        if (!user) throw new Error("User not found");

        const allUserIds = [userObjectId, ...(user.following || [])];

        // 🖼️ Resolve profile pictures
        const profilePicMap = await resolveUserProfilePics(allUserIds);

        // 🧾 Fetch user docs (for full names)
        const userDocs = await User.find({ _id: { $in: allUserIds } })
          .select('_id firstName lastName')
          .lean();

        // 🧠 Build full user objects
        const enrichedUserDocs = userDocs.map(u => ({
          _id: u._id,
          firstName: u.firstName,
          lastName: u.lastName,
          profilePic: profilePicMap[u._id.toString()]?.profilePic || null,
        }));

        // 🚀 Run gatherUserCheckIns for all users
        const enrichedCheckInsNested = await Promise.all(
          enrichedUserDocs.map(user =>
            gatherUserCheckIns(user, profilePicMap[user._id.toString()]?.profilePicUrl || null)
          )
        );

        // 📦 Flatten, sort, return
        const allCheckIns = enrichedCheckInsNested.flat().filter(Boolean);
        return allCheckIns.sort((a, b) => new Date(b.date) - new Date(a.date));
      } catch (error) {
        throw new Error("Failed to fetch user and following check-ins");
      }
    },
    getUserAndFollowingInvites: async (_, { userId }) => {
      try {
        const user = await User.findById(userId)
          .select('following firstName lastName profilePic')
          .lean();
        if (!user) throw new Error("User not found");

        const followingIds = (user.following || []).map(id => id.toString());

        // ⛳ 1. Fetch invites
        const [userInvitesRaw, followingPublicInvitesRaw] = await Promise.all([
          ActivityInvite.find({
            $or: [
              { senderId: userId },
              { 'recipients.userId': userId }
            ]
          }).lean(),

          ActivityInvite.find({
            senderId: { $in: followingIds },
            isPublic: true,
          }).lean()
        ]);

        const allInvites = [...userInvitesRaw, ...followingPublicInvitesRaw];

        // 🧠 2. Collect unique user IDs + placeIds
        const senderIds = allInvites.map(i => i.senderId.toString());
        const recipientIds = allInvites.flatMap(i => i.recipients.map(r => r.userId.toString()));
        const requestIds = allInvites.flatMap(i => i.requests?.map(r => r.userId.toString()) || []);
        const allUserIds = [...new Set([...senderIds, ...recipientIds, ...requestIds])];
        const placeIds = [...new Set(allInvites.map(i => i.placeId).filter(Boolean))];

        // 🧼 3. Fetch users and businesses
        const [users, businesses] = await Promise.all([
          User.find({ _id: { $in: allUserIds } }).lean(),
          Business.find({ placeId: { $in: placeIds } }).lean()
        ]);

        const userMap = new Map(users.map(u => [u._id.toString(), u]));
        const businessMap = new Map(businesses.map(b => [b.placeId, b]));

        // 🔑 4. Collect all photoKeys (users + business logos + comments) for presigned URL generation
        const photoKeys = [];

        for (const u of users) {
          if (u.profilePic?.photoKey) photoKeys.push(u.profilePic.photoKey);
        }

        for (const b of businesses) {
          if (b.logoKey) photoKeys.push(b.logoKey);
        }

        const allCommentMedia = allInvites.flatMap(inv => inv.comments || []).flatMap(c => {
          const media = [];
          if (c.media?.photoKey) media.push(c.media.photoKey);
          for (const r of c.replies || []) {
            if (r.media?.photoKey) media.push(r.media.photoKey);
          }
          return media;
        });

        photoKeys.push(...allCommentMedia);

        // 📷 5. Batch presigned URL resolution
        const presignedMap = {};
        await Promise.all(
          photoKeys.map(async (key) => {
            presignedMap[key] = await getPresignedUrl(key);
          })
        );

        // 📦 6. Build comment enrichment helper (reuse your existing function, but use presignedMap inside)
        const enrichInvite = async (invite) => {
          const sender = userMap.get(invite.senderId.toString());
          const senderPicKey = sender?.profilePic?.photoKey;
          const senderProfilePicUrl = senderPicKey ? presignedMap[senderPicKey] : null;

          const enrichedRecipients = invite.recipients.map(r => {
            const rec = userMap.get(r.userId.toString());
            const picKey = rec?.profilePic?.photoKey;
            return {
              user: {
                id: rec?._id || r.userId,
                firstName: rec?.firstName || '',
                lastName: rec?.lastName || '',
                profilePicUrl: picKey ? presignedMap[picKey] : null,
              },
              status: r.status,
            };
          });

          const enrichedRequests = (invite.requests || []).map(r => {
            const req = userMap.get(r.userId.toString());
            const picKey = req?.profilePic?.photoKey;
            return {
              _id: r._id?.toString(),
              userId: r.userId.toString(),
              status: r.status,
              firstName: req?.firstName || '',
              lastName: req?.lastName || '',
              profilePicUrl: picKey ? presignedMap[picKey] : null,
            };
          });

          const business = businessMap.get(invite.placeId);
          const businessLogoUrl = business?.logoKey ? presignedMap[business.logoKey] : null;

          const enrichedComments = await enrichComments(invite.comments || [], presignedMap);

          return {
            _id: invite._id,
            sender: {
              id: sender?._id,
              firstName: sender?.firstName || '',
              lastName: sender?.lastName || '',
              profilePicUrl: senderProfilePicUrl,
            },
            recipients: enrichedRecipients,
            placeId: invite.placeId,
            businessName: business?.businessName || '',
            businessLogoUrl,
            note: invite.note,
            dateTime: invite.dateTime?.toISOString() || null,
            message: invite.message,
            requests: enrichedRequests,
            isPublic: invite.isPublic,
            status: invite.status,
            likes: invite.likes || [],
            comments: enrichedComments,
            createdAt: invite.createdAt?.toISOString() || null,
            type: 'invite',
          };
        };

        const userInvites = await Promise.all(userInvitesRaw.map(enrichInvite));
        const followingInvites = await Promise.all(followingPublicInvitesRaw.map(enrichInvite));

        return {
          user,
          userInvites,
          friendPublicInvites: followingInvites,
        };
      } catch (err) {
        console.error("❌ Error in getUserAndFollowingInvites resolver:", err);
        throw new Error("Failed to fetch user and following invites");
      }
    },
    getUserActivity: async (_, { userId, limit = 15, after }, { dataSources }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error("Invalid userId format");
        }

        const reviews = await resolvers.Query.getUserAndFollowingReviews(_, { userId }, { dataSources }) || [];
        const checkIns = await resolvers.Query.getUserAndFollowingCheckIns(_, { userId }, { dataSources }) || [];
        const inviteData = await resolvers.Query.getUserAndFollowingInvites(_, { userId }, { dataSources }) || {};

        const invites = [
          ...(inviteData.userInvites || []),
          ...(inviteData.friendPublicInvites || [])
        ];

        const normalizeDate = (item) => {
          const rawDate = item.date || item.createdAt || item.timestamp || item.dateTime || 0;
          const parsedDate = new Date(rawDate);
          return {
            ...item,
            sortDate: parsedDate.toISOString(),
          };
        };

        const posts = [
          ...reviews.map(r => normalizeDate({ ...r, type: 'review' })),
          ...checkIns.map(c => normalizeDate({ ...c, type: 'check-in' })),
          ...invites.map(i => normalizeDate({ ...i, type: 'invite' })),
        ];

        let filtered = posts.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

        if (after?.sortDate && after?.id) {
          const afterTime = new Date(after.sortDate).getTime();
          filtered = filtered.filter(p => {
            const currentTime = new Date(p.sortDate).getTime();
            return currentTime < afterTime || (currentTime === afterTime && p._id < after.id);
          });
        }

        return filtered.slice(0, limit);
      } catch (error) {
        throw new Error("Failed to fetch user activity");
      }
    },
    getSuggestedFollows: async (_, { userId }, { user }) => {
      const currentUser = await User.findById(userId).select('following');
      if (!currentUser) {
        throw new Error('User not found');
      }

      const followingIds = currentUser.following.map(id => id.toString());

      // Step 1: Find second-degree connections and mutuals
      const followedUsers = await User.find({ _id: { $in: followingIds } }).select('following');

      const secondDegreeFollows = {};

      followedUsers.forEach(fu => {
        if (!fu.following) return;
        fu.following.forEach(followedId => {
          const idStr = followedId.toString();
          if (idStr !== userId && !followingIds.includes(idStr)) {
            if (!secondDegreeFollows[idStr]) secondDegreeFollows[idStr] = new Set();
            secondDegreeFollows[idStr].add(fu._id.toString());
          }
        });
      });

      const suggestionIds = Object.keys(secondDegreeFollows);

      if (suggestionIds.length === 0) {
        return [];
      }

      // Step 2: Get suggested users and mutuals
      const [suggestedUsers, mutualUsers] = await Promise.all([
        User.find({ _id: { $in: suggestionIds } }).lean(),
        User.find({ _id: { $in: followingIds } }).lean()
      ]);

      const mutualMap = new Map(mutualUsers.map(u => [u._id.toString(), u]));

      // Step 3: Resolve profile pics
      const allUserIdsNeedingPics = [
        ...suggestedUsers.map(u => u._id.toString()),
        ...mutualUsers.map(u => u._id.toString())
      ];
      const picMap = await resolveUserProfilePics(allUserIdsNeedingPics);

      // Step 4: Enrich suggestions
      const enriched = await Promise.all(
        suggestedUsers.map(async u => {
          const userIdStr = u._id.toString();
          const mutualConnections = Array.from(secondDegreeFollows[userIdStr] || []).map(mid => {
            const mu = mutualMap.get(mid);
            return mu ? {
              _id: mu._id,
              firstName: mu.firstName,
              lastName: mu.lastName,
              profilePic: mu.profilePic || null,
              profilePicUrl: picMap[mid]?.profilePicUrl || null,
            } : null;
          }).filter(Boolean);

          const userProfilePic = picMap[userIdStr]?.profilePic || null;
          const userProfilePicUrl = picMap[userIdStr]?.profilePicUrl || null;

          let reviews = [];
          let checkIns = [];

          try {
            [reviews, checkIns] = await Promise.all([
              gatherUserReviews(u._id, userProfilePic, userProfilePicUrl),
              gatherUserCheckIns(u, userProfilePicUrl)
            ]);
          } catch (err) {
            console.error(`❗ Failed to gather posts for user ${userIdStr}:`, err.message);
          }

          return {
            _id: userIdStr,
            firstName: u.firstName,
            lastName: u.lastName,
            fullName: `${u.firstName} ${u.lastName}`,
            profilePic: userProfilePic,
            profilePicUrl: userProfilePicUrl,
            mutualConnections,
            profileVisibility: u.privacySettings?.profileVisibility || 'public',
            reviews,
            checkIns,
          };
        })
      );

      return enriched;
    },
    userAndFollowingStories: async (_, { userId }, context) => {
      try {
        const currentUserId = context?.user?._id || userId; // fallback to queried userId

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
    },
    storiesByUser: async (_, { userId }, context) => {
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
    },
    getBusinessRatingSummaries: async (_, { placeIds }) => {
      try {
        if (!Array.isArray(placeIds) || placeIds.length === 0) {
          throw new Error("placeIds must be a non-empty array");
        }

        const summaries = await Promise.all(placeIds.map(async (placeId) => {
          const reviews = await Review.find({ placeId });

          if (!reviews.length) {
            return {
              placeId,
              averageRating: 0,
              averagePriceRating: 0,
              averageServiceRating: 0,
              averageAtmosphereRating: 0,
              recommendPercentage: 0,
            };
          }

          const ratingFields = {
            rating: [],
            priceRating: [],
            serviceRating: [],
            atmosphereRating: [],
            wouldRecommendCount: 0,
          };

          reviews.forEach((r, i) => {
            if (typeof r.rating === 'number') ratingFields.rating.push(r.rating);
            if (typeof r.priceRating === 'number') ratingFields.priceRating.push(r.priceRating);
            if (typeof r.serviceRating === 'number') ratingFields.serviceRating.push(r.serviceRating);
            if (typeof r.atmosphereRating === 'number') ratingFields.atmosphereRating.push(r.atmosphereRating);
            if (r.wouldRecommend === true) ratingFields.wouldRecommendCount += 1;

          });

          const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

          const summary = {
            placeId,
            averageRating: parseFloat(avg(ratingFields.rating).toFixed(2)),
            averagePriceRating: parseFloat(avg(ratingFields.priceRating).toFixed(2)),
            averageServiceRating: parseFloat(avg(ratingFields.serviceRating).toFixed(2)),
            averageAtmosphereRating: parseFloat(avg(ratingFields.atmosphereRating).toFixed(2)),
            recommendPercentage: Math.round((ratingFields.wouldRecommendCount / reviews.length) * 100),
          };

          return summary;
        }));

        return summaries;
      } catch (err) {
        throw new Error("Failed to compute business rating summaries");
      }
    },
  },
  UserActivity: {
    __resolveType(obj) {
      if (obj.reviewText !== undefined && obj.rating !== undefined) {
        return 'Review';
      }
      if (obj.message !== undefined && obj.date !== undefined && !obj.reviewText) {
        return 'CheckIn';
      }
      if (obj.sender !== undefined && obj.recipients !== undefined) {
        return 'ActivityInvite';
      }
      return null;
    }
  },
  UserPost: {
    __resolveType(obj) {
      if (obj.type === 'review' || obj.reviewText !== undefined) {
        return 'Review';
      }
      if (obj.type === 'checkin' || obj.message !== undefined) {
        return 'CheckIn';
      }
      throw new Error('Unknown type in UserPost resolver');
    },
  },
  Date: DateScalar,
};

// Export Apollo Server instance
const createApolloServer = () => {
  return new ApolloServer({
    typeDefs,
    resolvers,
    validationRules: [depthLimit(30)],
    context: async ({ req }) => {
      const user = await getUserFromToken(req);
      return {
        user, // inject into resolvers
      };
    },
  });
};

module.exports = createApolloServer;
