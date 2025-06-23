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

        const allUserIds = [userObjectId, ...(user.following || [])];

        // 👤 Get user names and profile photos
        const users = await User.find({ _id: { $in: allUserIds } })
          .select('_id firstName lastName profilePic')
          .lean();

        const picMap = await resolveUserProfilePics(allUserIds);
        const userMap = new Map();
        for (const u of users) {
          userMap.set(u._id.toString(), {
            fullName: `${u.firstName} ${u.lastName}`,
            profilePic: picMap[u._id.toString()]?.profilePic || null,
            profilePicUrl: picMap[u._id.toString()]?.profilePicUrl || null,
          });
        }

        // 🧠 Fetch top-level reviews from DB
        const rawReviews = await Review.find({ userId: { $in: allUserIds } }).lean();

        // 🧼 Enrich each review
        const enrichedReviews = await Promise.all(
          rawReviews.map(async (review) => {
            try {
              const userMeta = userMap.get(review.userId.toString());
              const business = await Business.findOne({ placeId: review.placeId }).select('businessName');
              const taggedUsers = await resolveTaggedUsers(review.taggedUsers || []);
              const rawPhotos = await resolveTaggedPhotoUsers(review.photos || []);
              const photos = rawPhotos.filter(p => p && p.photoKey);

              return {
                __typename: "Review",
                ...review,
                businessName: business?.businessName || null,
                date: new Date(review.date).toISOString(),
                profilePic: userMeta?.profilePic || null,
                profilePicUrl: userMeta?.profilePicUrl || null,
                fullName: userMeta?.fullName || "Unknown User",
                taggedUsers,
                photos,
                type: "review",
              };
            } catch (err) {
              console.warn("⚠️ Failed to enrich review:", review._id, err);
              return null;
            }
          })
        );

        // 🕒 Sort by latest date
        return enrichedReviews.filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));
      } catch (error) {
        console.error("❌ Error in getUserAndFollowingReviews:", {
          message: error.message,
          stack: error.stack,
        });
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

        // 👥 Fetch user's following list
        const user = await User.findById(userObjectId).select('following').lean();
        if (!user) throw new Error("User not found");

        const followingIds = user.following || [];
        const allUserIds = [userObjectId, ...followingIds];

        // 📸 Resolve profile pics for all users
        const picMap = await resolveUserProfilePics(allUserIds);

        // 📇 Fetch names for all users
        const userDocs = await User.find({ _id: { $in: allUserIds } })
          .select('_id firstName lastName')
          .lean();

        const userMap = new Map();
        for (const u of userDocs) {
          userMap.set(u._id.toString(), {
            fullName: `${u.firstName} ${u.lastName}`,
            profilePic: picMap[u._id.toString()]?.profilePic || null,
            profilePicUrl: picMap[u._id.toString()]?.profilePicUrl || null,
          });
        }

        // 🧾 Fetch raw check-ins
        const checkInsRaw = await CheckIn.find({ userId: { $in: allUserIds } }).lean();

        // ✨ Enrich check-ins
        const enriched = await Promise.all(
          checkInsRaw.map(async (checkIn) => {
            try {
              const userMeta = userMap.get(checkIn.userId?.toString());
              if (!userMeta) return null;

              const [taggedUsers, rawPhotos, business] = await Promise.all([
                resolveTaggedUsers(checkIn.taggedUsers || []),
                resolveTaggedPhotoUsers(checkIn.photos || []),
                Business.findOne({ placeId: checkIn.placeId?.trim() })
                  .select("businessName")
                  .lean(),
              ]);

              const photos = rawPhotos.filter(p => p && p.photoKey);
              const businessName = business?.businessName || "Unknown Business";

              return {
                __typename: "CheckIn",
                ...checkIn,
                fullName: userMeta.fullName,
                profilePic: userMeta.profilePic,
                profilePicUrl: userMeta.profilePicUrl,
                businessName,
                taggedUsers,
                photos,
                type: "check-in",
                date: new Date(checkIn.date).toISOString(),
              };
            } catch (err) {
              console.error(`❌ Error enriching check-in ${checkIn._id}:`, err);
              return null;
            }
          })
        );

        // ✅ Sort by date (most recent first)
        return enriched.filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));
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
        console.log("📥 Incoming placeIds:", placeIds);

        if (!Array.isArray(placeIds) || placeIds.length === 0) {
          throw new Error("placeIds must be a non-empty array");
        }

        const businesses = await Business.find({ placeId: { $in: placeIds } }).lean();
        console.log("🏢 Found businesses:", businesses.map(b => b.placeId));

        const summaries = placeIds.map((placeId) => {
          const business = businesses.find(b => b.placeId === placeId);
          if (!business) {
            console.warn(`⚠️ No business found for placeId: ${placeId}`);
          }

          if (!business || !business.reviews?.length) {
            console.warn(`⚠️ No reviews found for business: ${placeId}`);
            return {
              placeId,
              averageRating: 0,
              averagePriceRating: 0,
              averageServiceRating: 0,
              averageAtmosphereRating: 0,
              recommendPercentage: 0,
            };
          }

          const { reviews } = business;
          console.log(`📝 Calculating summary for ${placeId}, review count: ${reviews.length}`);

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

            console.log(`   ↳ Review #${i + 1} — rating: ${r.rating}, price: ${r.priceRating}, service: ${r.serviceRating}, atmosphere: ${r.atmosphereRating}, recommend: ${r.wouldRecommend}`);
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

          console.log(`✅ Summary for ${placeId}:`, summary);

          return summary;
        });

        console.log("✅ Final summaries array:", summaries);
        return summaries;
      } catch (err) {
        console.error("❌ Error in getBusinessRatingSummaries:", err);
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
