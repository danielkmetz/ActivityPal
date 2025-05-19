const { ApolloServer } = require('@apollo/server');
const { gql } = require('graphql-tag');
const mongoose = require('mongoose');
const User = require('../models/User'); // Import User Model
const Business = require('../models/Business'); // Import Review Model
const ActivityInvite = require('../models/ActivityInvites.js');
const depthLimit = require('graphql-depth-limit');
const { GraphQLScalarType, Kind } = require('graphql');
const { getCheckInsByPlaceId } = require('../utils/getCheckInsByPlaceId.js');
const { getUserFromToken } = require('../utils/auth.js');
const { gatherUserReviews, gatherUserCheckIns, resolveTaggedPhotoUsers, resolveTaggedUsers, resolveUserProfilePics } = require('../utils/userPosts.js');
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

// Define GraphQL Schema
const typeDefs = gql`
  scalar Date

  # ✅ Unified User Activity Type (Includes Reviews & Check-ins)
  type UserActivity {
    _id: ID!
    userId: ID!
    fullName: String!
    placeId: String!
    businessName: String
    message: String
    reviewText: String
    rating: Int
    date: String
    photos: [Photo!]
    likes: [Like!]
    comments: [Comment!]
    profilePicUrl: String
    profilePic: ProfilePic
    taggedUsers: [TaggedUser!]
    type: String! # ✅ Used to distinguish reviews from check-ins
  }

  type User {
    id: ID!
    firstName: String
    lastName: String
    fullName: String
    profilePicUrl: String
    profilePic: ProfilePic
  }

  # ✅ Review Type
  type Review {
    _id: ID!
    businessName: String! 
    placeId: String! 
    rating: Int!
    reviewText: String!
    date: Date!
    likes: [Like]
    comments: [Comment]
    userId: ID!
    fullName: String!
    profilePic: ProfilePic
    profilePicUrl: String
    taggedUsers: [TaggedUser]
    photos: [Photo!]
    type: String!
    sortDate: String
  }

  # ✅ Check-In Type
  type CheckIn {
    _id: ID!
    date: Date!
    userId: ID!
    fullName: String!
    placeId: String!
    businessName: String!
    message: String
    photos: [Photo!]
    profilePic: ProfilePic
    profilePicUrl: String
    comments: [Comment]
    likes: [Like]
    taggedUsers: [TaggedUser]
    type: String! # ✅ Used to distinguish between reviews and check-ins in frontend
    sortDate: String
  }

  type ActivityInvite {
    _id: ID!
    sender: InviteUser!
    recipients: [InviteRecipient!]!
    placeId: String!
    businessName: String!
    businessLogoUrl: String
    note: String
    dateTime: String!
    message: String
    isPublic: Boolean!
    status: String!
    createdAt: String!
    likes: [Like]
    comments: [Comment]
    type: String!
    requests: [Request]
    sortDate: String
  }

  input ActivityCursor {
    sortDate: String!
    id: ID!
  }

  type Request {
    _id: ID!
    userId: ID!
    status: String!
    firstName: String
    lastName: String
    profilePicUrl: String
  }

  type InviteUser {
    id: ID!
    firstName: String
    lastName: String
    profilePicUrl: String
  }
    
  type InviteRecipient {
    user: InviteUser!
    status: String!
  }

  # ✅ Photo Type
  type Photo {
    _id: ID!
    photoKey: String!
    uploadedBy: String!
    description: String
    taggedUsers: [TaggedUser]
    uploadDate: Date!
    url: String # ✅ Added field for pre-signed URL
  }

  # ✅ Profile Picture Type
  type ProfilePic {
    _id: ID!
    photoKey: String!
    uploadedBy: String!
    description: String
    tags: [String]
    uploadDate: String!
  }

  type TaggedUser {
    userId: ID!
    fullName: String
    x: Float
    y: Float
  }

  # ✅ Likes
  type Like {
    userId: ID!
    fullName: String!
  }

  # ✅ Comments & Replies (Nested)
  type Comment {
    _id: ID!
    commentText: String!
    userId: ID!
    fullName: String!
    replies: [Reply!]
    likes: [ID]
    date: Date!
  }

  type Reply {
    _id: ID!
    commentText: String!
    userId: ID!
    fullName: String!
    replies: [Reply!]
    likes: [ID]
    date: Date!
  }

  type FollowersAndFollowing {
    followers: [User!]!
    following: [User!]!
  }

  type MutualUser {
    _id: ID!
    firstName: String
    lastName: String
    profilePic: ProfilePic
    profilePicUrl: String
  }

  type SuggestedUser {
    _id: ID!
    firstName: String
    lastName: String
    fullName: String
    profilePicUrl: String
    profilePic: ProfilePic
    mutualConnections: [MutualUser!]!
    profileVisibility: String!
  }

  type Story {
    _id: ID!
    mediaKey: String!
    mediaType: String!
    caption: String
    visibility: String
    expiresAt: String
    taggedUsers: [TaggedUser]
    mediaUrl: String
    profilePicUrl: String
    user: UserSummary!
    viewedBy: [UserSummary!]           # Array of user IDs who have viewed the story
    isViewed: Boolean         # Derived field, based on current user context
  }

  type UserSummary {
    _id: ID!
    firstName: String!
    lastName: String!
    profilePicUrl: String
  }

  type UserAndFriendsInvites {
    user: User!
    userInvites: [ActivityInvite!]!
    friendPublicInvites: [ActivityInvite!]!
  }

  union UserActivity = Review | CheckIn | ActivityInvite
  union UserPost = Review | CheckIn

  # ✅ Queries
  type Query {
    getUserAndFollowingReviews(userId: String!): [Review!]
    getUserPosts(userId: ID!, limit: Int, after: ActivityCursor): [UserPost!]
    getBusinessReviews(placeId: String!, limit: Int, after: ActivityCursor): [UserPost!]
    getUserAndFollowingCheckIns(userId: String!): [CheckIn!]
    getUserAndFollowingInvites(userId: ID!): UserAndFriendsInvites
    getUserActivity(userId: ID!, limit: Int, after: ActivityCursor): [UserActivity!]
    getSuggestedFollows(userId: ID!): [SuggestedUser!]!
    userAndFollowingStories(userId: ID!): [Story]
    storiesByUser(userId: ID!): [Story]
  }
`;

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

        // 🔍 Fetch user and their `following` list
        const user = await User.findById(userObjectId)
          .select('following')
          .lean();

        if (!user) throw new Error("User not found");

        const followedIds = user.following || [];
        const allUserIds = [userObjectId, ...followedIds];
        const allUserIdStrings = allUserIds.map(id => id.toString());

        // 📸 Resolve profilePic and profilePicUrl for each involved user
        const picMap = await resolveUserProfilePics(allUserIds);

        // 👤 Also get name data
        const users = await User.find({ _id: { $in: allUserIds } })
          .select('_id firstName lastName profilePic')
          .lean();

        const userMap = new Map();
        for (const u of users) {
          userMap.set(u._id.toString(), {
            ...u,
            profilePic: picMap[u._id.toString()]?.profilePic || null,
            profilePicUrl: picMap[u._id.toString()]?.profilePicUrl || null,
          });
        }

        // 🧠 Gather reviews from user and followed users
        const allReviews = [];
        for (const uid of allUserIdStrings) {
          const userEntry = userMap.get(uid);
          if (!userEntry) continue;

          const reviews = await gatherUserReviews(
            new mongoose.Types.ObjectId(uid),
            userEntry.profilePic,
            userEntry.profilePicUrl
          );

          allReviews.push(...reviews);
        }

        // 🕒 Sort by latest first
        return allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));
      } catch (error) {
        console.error("❌ Error in getUserAndFollowingReviews:", error);
        throw new Error("Failed to fetch user and following reviews");
      }
    },
    getUserPosts: async (_, { userId, limit = 15, after }) => {
      try {
        console.log('📥 getUserPosts called with:', { userId, limit, after });

        const userObjectId = new mongoose.Types.ObjectId(userId);

        const user = await User.findById(userObjectId).select(
          '_id profilePic checkIns firstName lastName'
        );

        if (!user) {
          console.warn('⚠️ User not found for ID:', userId);
          throw new Error('User not found');
        }

        const photoKey = user.profilePic?.photoKey || null;
        const profilePicUrl = photoKey
          ? await getPresignedUrl(photoKey)
          : null;

        console.log('👤 User loaded:', {
          name: `${user.firstName} ${user.lastName}`,
          photoKey,
          profilePicUrl,
        });

        const reviews = await gatherUserReviews(userObjectId, user.profilePic, profilePicUrl);
        console.log(`📝 Reviews gathered: ${reviews.length}`);

        const checkIns = await gatherUserCheckIns(user, profilePicUrl);
        console.log(`📍 Check-ins gathered: ${checkIns.length}`);

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

        console.log(`🧮 Total posts before pagination: ${sorted.length}`);

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

          console.log(`🔎 Posts after applying 'after' filter: ${sorted.length}`);
        }

        const result = sorted.slice(0, limit);
        console.log(`✅ Returning ${result.length} posts`);
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

        const allReviews = business.reviews || [];
        const reviewUserIds = allReviews.map(r => r.userId);
        const userPicMap = await resolveUserProfilePics(reviewUserIds);

        const enrichedReviews = await Promise.all(
          allReviews.map(async (review) => {
            const photos = await resolveTaggedPhotoUsers(review.photos || []);
            const taggedUsers = await resolveTaggedUsers(review.taggedUsers || []);

            return {
              ...review,
              type: 'review',
              businessName: business.businessName,
              placeId: business.placeId,
              date: new Date(review.date).toISOString(),
              sortDate: new Date(review.date).toISOString(),
              profilePic: userPicMap[review.userId?.toString()]?.profilePic || null,
              profilePicUrl: userPicMap[review.userId?.toString()]?.profilePicUrl || null,
              photos,
              taggedUsers,
            };
          })
        );

        const checkIns = await getCheckInsByPlaceId(placeId);
        checkIns.forEach(ci => (ci.businessName = business.businessName));

        let allPosts = [...enrichedReviews, ...checkIns];

        allPosts.sort((a, b) => {
          const dateDiff = new Date(b.sortDate) - new Date(a.sortDate);
          if (dateDiff !== 0) return dateDiff;
          return new mongoose.Types.ObjectId(b._id).toString().localeCompare(
            new mongoose.Types.ObjectId(a._id).toString()
          );
        });

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
        console.error('❌ Error in getBusinessReviews:', error);
        throw new Error('Failed to fetch business reviews');
      }
    },
    getUserAndFollowingCheckIns: async (_, { userId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error("Invalid userId format");
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);

        // 🔍 Fetch user and their following list
        const user = await User.findById(userObjectId)
          .select('following')
          .lean();

        if (!user) throw new Error("User not found");

        const followingIds = user.following || [];
        const allUserIds = [userObjectId, ...followingIds];
        const allUserIdStrings = allUserIds.map(id => id.toString());

        // 📸 Resolve profilePic and profilePicUrl for each user
        const picMap = await resolveUserProfilePics(allUserIds);

        // 👤 Fetch basic info + checkIns for all relevant users
        const users = await User.find({ _id: { $in: allUserIds } })
          .select('_id firstName lastName checkIns profilePic')
          .lean();

        const checkInResults = [];

        for (const u of users) {
          const enrichedCheckIns = await gatherUserCheckIns(
            u,
            picMap[u._id.toString()]?.profilePicUrl || null
          );

          checkInResults.push(...enrichedCheckIns);
        }

        return checkInResults.sort((a, b) => new Date(b.date) - new Date(a.date));
      } catch (error) {
        console.error("❌ Error in getUserAndFollowingCheckIns:", error);
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

        // Fetch invites sent by or to the user
        const userInvitesRaw = await ActivityInvite.find({
          $or: [
            { senderId: userId },
            { 'recipients.userId': userId }
          ]
        }).lean();

        // Fetch public invites sent by users they follow
        const followingPublicInvitesRaw = await ActivityInvite.find({
          senderId: { $in: followingIds },
          isPublic: true,
        }).lean();

        // Combine for enrichment
        const allInvites = [...userInvitesRaw, ...followingPublicInvitesRaw];

        // Collect unique user & business identifiers for enrichment
        const senderIds = [...new Set(allInvites.map(inv => inv.senderId.toString()))];
        const recipientUserIds = allInvites.flatMap(inv => inv.recipients.map(r => r.userId.toString()));
        const requestUserIds = allInvites.flatMap(inv => inv.requests?.map(r => r.userId.toString()) || []);
        const placeIds = allInvites.map(inv => inv.placeId).filter(Boolean);
        const allUserIds = [...new Set([...senderIds, ...recipientUserIds, ...requestUserIds])];

        // Fetch all users and businesses
        const [allUsers, allBusinesses] = await Promise.all([
          User.find({ _id: { $in: allUserIds } }).lean(),
          Business.find({ placeId: { $in: placeIds } }).lean(),
        ]);

        const userMap = new Map(allUsers.map(u => [u._id.toString(), u]));
        const businessMap = new Map(allBusinesses.map(b => [b.placeId, b]));

        // Helper to enrich invites
        const enrichInvite = async (invite) => {
          const sender = userMap.get(invite.senderId.toString());
          const senderProfilePicUrl = sender?.profilePic?.photoKey
            ? await getPresignedUrl(sender.profilePic.photoKey)
            : null;

          const enrichedRecipients = await Promise.all(
            invite.recipients.map(async (r) => {
              const recipientUser = userMap.get(r.userId.toString());
              const profilePicUrl = recipientUser?.profilePic?.photoKey
                ? await getPresignedUrl(recipientUser.profilePic.photoKey)
                : null;

              return {
                user: {
                  id: recipientUser?._id || r.userId,
                  firstName: recipientUser?.firstName || '',
                  lastName: recipientUser?.lastName || '',
                  profilePicUrl,
                },
                status: r.status,
              };
            })
          );

          const enrichedRequests = await Promise.all(
            (invite.requests || []).map(async (r) => {
              const requestUser = userMap.get(r.userId.toString());
              const profilePicUrl = requestUser?.profilePic?.photoKey
                ? await getPresignedUrl(requestUser.profilePic.photoKey)
                : null;

              return {
                _id: r._id?.toString(),
                userId: r.userId.toString(),
                status: r.status,
                firstName: requestUser?.firstName || '',
                lastName: requestUser?.lastName || '',
                profilePicUrl,
              };
            })
          );

          const business = businessMap.get(invite.placeId);
          const businessLogoUrl = business?.logoKey
            ? await getPresignedUrl(business.logoKey)
            : null;

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
            dateTime: invite.dateTime.toISOString(),
            message: invite.message,
            requests: enrichedRequests,
            isPublic: invite.isPublic,
            status: invite.status,
            likes: invite.likes || [],
            comments: invite.comments || [],
            createdAt: invite.createdAt.toISOString(),
            type: 'invite',
          };
        };

        // Enrich only scoped invites
        const resolvedUserInvites = await Promise.all(userInvitesRaw.map(enrichInvite));
        const resolvedFollowingInvites = await Promise.all(followingPublicInvitesRaw.map(enrichInvite));

        return {
          user,
          userInvites: resolvedUserInvites,
          friendPublicInvites: resolvedFollowingInvites, // can rename in schema to `followingPublicInvites`
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
      if (!currentUser) throw new Error('User not found');

      const followingIds = currentUser.following.map(id => id.toString());

      // Step 1: Get second-degree connections with mutual tracking
      const followedUsers = await User.find({ _id: { $in: followingIds } }).select('following');
      const secondDegreeFollows = {};

      followedUsers.forEach(fu => {
        if (!fu.following) return;
        fu.following.forEach(followedId => {
          const idStr = followedId.toString();
          if (idStr !== userId && !followingIds.includes(idStr)) {
            if (!secondDegreeFollows[idStr]) secondDegreeFollows[idStr] = new Set();
            secondDegreeFollows[idStr].add(fu._id.toString()); // Track mutuals
          }
        });
      });

      const suggestionIds = Object.keys(secondDegreeFollows);

      // Step 2: Get full user and mutual data
      const [suggestedUsers, mutualUsers] = await Promise.all([
        User.find({ _id: { $in: suggestionIds } }).select('firstName lastName profilePic privacySettings'),
        User.find({ _id: { $in: followingIds } }).select('firstName lastName profilePic'),
      ]);

      const mutualMap = new Map(mutualUsers.map(u => [u._id.toString(), u]));

      // Step 4: Enrich and format suggestions
      const enriched = await Promise.all(
        suggestedUsers.map(async u => {
          const profilePicUrl = await getPresignedUrl(u.profilePic?.photoKey);

          const mutualConnections = Array.from(secondDegreeFollows[u._id.toString()] || []).map(id => {
            const mutualUser = mutualMap.get(id);
            return mutualUser
              ? {
                _id: mutualUser._id,
                firstName: mutualUser.firstName,
                lastName: mutualUser.lastName,
                profilePic: mutualUser.profilePic || null,
              }
              : null;
          }).filter(Boolean);

          const mutualConnectionUrls = await Promise.all(
            mutualConnections.map(async (m) => ({
              ...m,
              profilePicUrl: await getPresignedUrl(m.profilePic?.photoKey),
            }))
          );

          return {
            _id: u._id.toString(),
            firstName: u.firstName,
            lastName: u.lastName,
            fullName: `${u.firstName} ${u.lastName}`,
            profilePic: u.profilePic || null,
            profilePicUrl,
            mutualConnections: mutualConnectionUrls,
            profileVisibility: u.privacySettings?.profileVisibility || 'public',
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
