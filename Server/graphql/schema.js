const { ApolloServer } = require('@apollo/server');
const { gql } = require('graphql-tag');
const mongoose = require('mongoose');
const User = require('../models/User'); // Import User Model
const Business = require('../models/Business'); // Import Review Model
const ActivityInvite = require('../models/ActivityInvites.js');
const { generateDownloadPresignedUrl } = require('../helpers/generateDownloadPresignedUrl.js');
const depthLimit = require('graphql-depth-limit');
const { GraphQLScalarType, Kind } = require('graphql');

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
  }

  type Request {
    _id: ID!
    userId: ID!
    status: String!
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
    _id: ID
    fullName: String
    x: Float!
    y: Float!
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
    date: Date!
  }

  type Reply {
    _id: ID!
    commentText: String!
    userId: ID!
    fullName: String!
    replies: [Reply!]
    date: Date!
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
    getUserAndFriendsReviews(userId: String!): [Review!]
    getUserPosts(userId: String!): [UserPost!]
    getBusinessReviews(placeId: String!): [Review!]
    getUserAndFriendsCheckIns(userId: String!): [CheckIn!]
    getUserAndFriendsInvites(userId: ID!): UserAndFriendsInvites
    getUserActivity(userId: String!): [UserActivity!] # ✅ Fetches both reviews & check-ins
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
    getUserAndFriendsReviews: async (_, { userId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error("Invalid userId format");
        }
    
        const userObjectId = new mongoose.Types.ObjectId(userId);
    
        // Fetch user and friends
        const user = await User.findById(userObjectId).populate({ path: 'friends', select: '_id profilePic' }).lean();
        if (!user) throw new Error('User not found');
    
        const friendIds = user.friends.map(f => f._id);
        const allUserIds = [userObjectId, ...friendIds];
    
        // Find businesses that contain reviews by these users
        const businesses = await Business.find({
          "reviews.userId": { $in: allUserIds }
        })
          .select('placeId businessName reviews') // Avoid extra fields
          .lean();
    
        if (!businesses.length) return [];
    
        // Flatten all review-level user IDs + tagged photo user IDs
        const allReviewUserIds = new Set();
        const allTaggedUserIds = new Set();
        const allPhotoKeys = [];
    
        for (const business of businesses) {
          for (const review of business.reviews) {
            if (allUserIds.some(id => id.toString() === review.userId.toString())) {
              allReviewUserIds.add(review.userId.toString());
    
              if (Array.isArray(review.taggedUsers)) {
                review.taggedUsers.forEach(uid => allTaggedUserIds.add(uid.toString()));
              }
    
              if (Array.isArray(review.photos)) {
                for (const photo of review.photos) {
                  allPhotoKeys.push(photo.photoKey);
                  if (Array.isArray(photo.taggedUsers)) {
                    photo.taggedUsers.forEach(tag => {
                      if (tag?.userId) allTaggedUserIds.add(tag.userId.toString());
                    });
                  }
                }
              }
            }
          }
        }
    
        // Fetch all users at once
        const allRelevantUserIds = [...new Set([...allReviewUserIds, ...allTaggedUserIds])];
        const users = await User.find({ _id: { $in: allRelevantUserIds } })
          .select('_id firstName lastName profilePic')
          .lean();
    
        const userMap = new Map(users.map(u => [u._id.toString(), u]));
    
        // Generate profilePic URLs in parallel
        const picUrlMap = {};
        await Promise.all(
          users.map(async user => {
            const photoKey = user?.profilePic?.photoKey;
            const url = photoKey ? await generateDownloadPresignedUrl(photoKey) : null;
            picUrlMap[user._id.toString()] = url;
          })
        );
    
        // Flatten and enrich reviews
        const allEnrichedReviews = [];
    
        for (const business of businesses) {
          for (const review of business.reviews) {
            if (!allUserIds.some(id => id.toString() === review.userId.toString())) continue;
    
            const taggedUsers = (Array.isArray(review.taggedUsers) && review.taggedUsers.length > 0)
              ? review.taggedUsers.map(uid => {
                  const user = userMap.get(uid.toString());
                  return {
                    userId: uid,
                    fullName: user ? `${user.firstName} ${user.lastName}` : 'Unknown User'
                  };
                })
              : [];
    
            const enrichedPhotos = (Array.isArray(review.photos) ? await Promise.all(
              review.photos.map(async (photo) => {
                const photoUrl = await generateDownloadPresignedUrl(photo.photoKey);
    
                const tagged = Array.isArray(photo.taggedUsers)
                  ? photo.taggedUsers.map(tag => {
                      const user = userMap.get(tag.userId?.toString());
                      return {
                        userId: tag.userId,
                        fullName: user ? `${user.firstName} ${user.lastName}` : 'Unknown User',
                        x: tag.x || 0,
                        y: tag.y || 0
                      };
                    })
                  : [];
    
                return {
                  ...photo,
                  url: photoUrl,
                  taggedUsers: tagged
                };
              })
            ) : []);
    
            allEnrichedReviews.push({
              ...review,
              businessName: business.businessName,
              placeId: business.placeId,
              date: new Date(review.date).toISOString(),
              profilePic: userMap.get(review.userId.toString())?.profilePic || null,
              profilePicUrl: picUrlMap[review.userId.toString()] || null,
              taggedUsers,
              photos: enrichedPhotos,
            });
          }
        }
    
        return allEnrichedReviews.sort((a, b) => new Date(b.date) - new Date(a.date));
      } catch (error) {
        console.error('❌ Error in getUserAndFriendsReviews:', error);
        throw new Error('Failed to fetch reviews');
      }
    },        
    getUserPosts: async (_, { userId }) => {
      try {
        const userObjectId = new mongoose.Types.ObjectId(userId);
    
        // Fetch user profile pic and check-ins
        const user = await User.findById(userObjectId).select('_id profilePic checkIns firstName lastName');
        if (!user) throw new Error('User not found');
    
        const photoKey = user.profilePic?.photoKey || null;
        const profilePicUrl = photoKey ? await generateDownloadPresignedUrl(photoKey) : null;
    
        // ✅ Fetch Reviews
        const businesses = await Business.find({ "reviews.userId": userObjectId }).lean();
        let reviews = [];
        for (const business of businesses) {
          const businessReviews = await Promise.all(
            business.reviews
              .filter((review) => review.userId.toString() === userId)
              .map(async (review) => {
    
                // ✅ Ensure `review.photos` is an array before mapping
                const photosWithUserNames = Array.isArray(review.photos)
                  ? await Promise.all(
                      review.photos.map(async (photo) => {
    
                        // ✅ Ensure `photo.taggedUsers` is an array before mapping
                        const taggedUserIds = Array.isArray(photo.taggedUsers)
                          ? photo.taggedUsers.map(tag => tag.userId).filter(Boolean) // Filter out undefined values
                          : [];
    
                        const taggedUserDetails = taggedUserIds.length > 0
                          ? await User.find({ _id: { $in: taggedUserIds } }, { firstName: 1, lastName: 1 })
                          : [];
    
                        const taggedUsersWithPositions = Array.isArray(photo.taggedUsers)
                          ? photo.taggedUsers.map(tag => {
                              const user = taggedUserDetails.find(u => u._id.toString() === tag.userId?.toString());
                              return {
                                userId: tag.userId,
                                fullName: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
                                x: tag.x || 0,
                                y: tag.y || 0
                              };
                            })
                          : [];
    
                        return {
                          ...photo,
                          url: await generateDownloadPresignedUrl(photo.photoKey),
                          taggedUsers: taggedUsersWithPositions, // ✅ Now includes x, y for rendering
                        };
                      })
                    )
                  : [];
    
                // ✅ Process tagged users for the entire review
                let taggedUsers = [];
                if (Array.isArray(review.taggedUsers) && review.taggedUsers.length > 0) {
                  const taggedUsersData = await User.find(
                    { _id: { $in: review.taggedUsers } },
                    { firstName: 1, lastName: 1 }
                  );
    
                  taggedUsers = taggedUsersData.map(user => ({
                    userId: user._id,
                    fullName: `${user.firstName} ${user.lastName}`,
                  }));
                }
    
                return {
                  __typename: "Review",
                  ...review,
                  businessName: business.businessName,
                  placeId: business.placeId,
                  date: new Date(review.date).toISOString(),
                  profilePic: user.profilePic || null,
                  profilePicUrl,
                  photos: photosWithUserNames, // ✅ Now includes x, y for rendering
                  taggedUsers, // ✅ Includes full names of tagged users
                  type: 'review',
                };
              })
          );
    
          reviews.push(...businessReviews);
        }
    
        // ✅ Fetch Check-Ins
        let checkIns = [];
        if (user.checkIns && user.checkIns.length > 0) {
          checkIns = await Promise.all(
            user.checkIns.map(async (checkIn) => {
    
              // ✅ Ensure `checkIn.photos` is an array before mapping
              const photosWithUserNames = Array.isArray(checkIn.photos)
                ? await Promise.all(
                    checkIn.photos.map(async (photo) => {
    
                      // ✅ Ensure `photo.taggedUsers` is an array before mapping
                      const taggedUserIds = Array.isArray(photo.taggedUsers)
                        ? photo.taggedUsers.map(tag => tag.userId).filter(Boolean)
                        : [];
    
                      const taggedUserDetails = taggedUserIds.length > 0
                        ? await User.find({ _id: { $in: taggedUserIds } }, { firstName: 1, lastName: 1 })
                        : [];
    
                      const taggedUsersWithPositions = Array.isArray(photo.taggedUsers)
                        ? photo.taggedUsers.map(tag => {
                            const user = taggedUserDetails.find(u => u._id.toString() === tag.userId?.toString());
                            return {
                              userId: tag.userId,
                              fullName: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
                              x: tag.x || 0,
                              y: tag.y || 0
                            };
                          })
                        : [];
    
                        return {
                          _id: photo._id, // ✅ Ensure photo ObjectId is explicitly returned
                          photoKey: photo.photoKey,
                          uploadedBy: photo.uploadedBy,
                          uploadDate: photo.uploadDate,
                          description: photo.description,
                          url: await generateDownloadPresignedUrl(photo.photoKey) || "", // Ensure URL exists
                          taggedUsers: taggedUsersWithPositions
                        };
                    })
                  )
                : [];
    
              let businessName = null;
              if (checkIn.placeId) {
                const business = await Business.findOne({ placeId: checkIn.placeId }).select('businessName');
                businessName = business ? business.businessName : null;
              }
    
              // ✅ Process tagged users for the entire check-in
              let taggedUsers = [];
              if (Array.isArray(checkIn.taggedUsers) && checkIn.taggedUsers.length > 0) {
                const taggedUsersData = await User.find(
                  { _id: { $in: checkIn.taggedUsers } },
                  { firstName: 1, lastName: 1 }
                );
    
                taggedUsers = taggedUsersData.map(user => ({
                  userId: user._id,
                  fullName: `${user.firstName} ${user.lastName}`,
                }));
              }
    
              return {
                __typename: "CheckIn",
                _id: checkIn._id,
                userId,
                fullName: `${user.firstName} ${user.lastName}`,
                message: checkIn.message,
                date: new Date(checkIn.date).toISOString(),
                photos: photosWithUserNames, // ✅ Now includes x, y for rendering
                likes: checkIn.likes || [],
                comments: checkIn.comments || [],
                taggedUsers, // ✅ Includes full names of tagged users
                profilePic: user.profilePic || null,
                profilePicUrl,
                placeId: checkIn.placeId || null,
                businessName,
                type: 'check-in',
              };
            })
          );
        }
    
        // ✅ Combine and Sort by Date
        const posts = [...reviews, ...checkIns].sort((a, b) => new Date(b.date) - new Date(a.date));
    
        return posts;
      } catch (error) {
        console.error('❌ Error fetching user posts:', error);
        throw new Error('Failed to fetch user posts');
      }
    },    
    getBusinessReviews: async (_, { placeId }) => {
      try {
        if (!placeId) {
          throw new Error("Invalid placeId");
        }
    
        // Find the business with the given placeId
        const business = await Business.findOne({ placeId }).lean();
    
        if (!business) {
          console.warn(`⚠️ No business found for placeId ${placeId}`);
          return [];
        }
    
        // Extract userIds from reviews
        const userIds = business.reviews.map((review) => review.userId);
    
        // Fetch user profile pictures
        const users = await User.find({ _id: { $in: userIds } }).select('_id profilePic');
    
        // Map user profile pictures
        const userPicMap = {};
        for (const user of users) {
          const photoKey = user.profilePic?.photoKey || null;
          userPicMap[user._id.toString()] = {
            profilePic: user.profilePic || null,
            profilePicUrl: photoKey ? await generateDownloadPresignedUrl(photoKey) : null
          };
        }
    
        // Process reviews
        let reviews = await Promise.all(
          business.reviews.map(async (review) => {
    
            // ✅ Ensure `review.photos` is an array before mapping
            const photosWithUserNames = Array.isArray(review.photos)
              ? await Promise.all(
                  review.photos.map(async (photo) => {
    
                    // ✅ Ensure `photo.taggedUsers` is an array before mapping
                    const taggedUserIds = Array.isArray(photo.taggedUsers)
                      ? photo.taggedUsers.map(tag => tag.userId).filter(Boolean) // Filter out undefined values
                      : [];
    
                    const taggedUserDetails = taggedUserIds.length > 0
                      ? await User.find({ _id: { $in: taggedUserIds } }, { firstName: 1, lastName: 1 })
                      : [];
    
                    const taggedUsersWithPositions = Array.isArray(photo.taggedUsers)
                      ? photo.taggedUsers.map(tag => {
                          const user = taggedUserDetails.find(u => u._id.toString() === tag.userId?.toString());
                          return {
                            userId: tag.userId,
                            fullName: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
                            x: tag.x || 0,
                            y: tag.y || 0
                          };
                        })
                      : [];
    
                    return {
                      ...photo,
                      url: await generateDownloadPresignedUrl(photo.photoKey),
                      taggedUsers: taggedUsersWithPositions, // ✅ Now includes x, y for rendering
                    };
                  })
                )
              : [];
    
            // ✅ Ensure `review.taggedUsers` is an array before processing
            let taggedUsers = [];
            if (Array.isArray(review.taggedUsers) && review.taggedUsers.length > 0) {
              const taggedUsersData = await User.find(
                { _id: { $in: review.taggedUsers } },
                { firstName: 1, lastName: 1 }
              );
    
              taggedUsers = taggedUsersData.map(user => ({
                userId: user._id,
                fullName: `${user.firstName} ${user.lastName}`,
              }));
            }
    
            return {
              ...review,
              type: review.type || "review",
              businessName: business.businessName,
              placeId: business.placeId,
              date: new Date(review.date).toISOString(),
              profilePic: userPicMap[review.userId]?.profilePic || null,
              profilePicUrl: userPicMap[review.userId]?.profilePicUrl || null,
              photos: photosWithUserNames, // ✅ Now includes x, y for rendering
              taggedUsers, // ✅ Includes full names of tagged users
            };
          })
        );
    
        // **Sort by date (newest first)**
        reviews.sort((a, b) => new Date(b.date) - new Date(a.date));
    
        return reviews;
      } catch (error) {
        console.error('❌ Error fetching business reviews:', error);
        throw new Error('Failed to fetch business reviews');
      }
    },    
    getUserAndFriendsCheckIns: async (_, { userId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error("Invalid userId format");
        }
    
        const userObjectId = new mongoose.Types.ObjectId(userId);
    
        // Fetch the user and populate friends list
        const user = await User.findById(userObjectId).populate({ path: "friends", select: "_id" });
    
        if (!user) {
          throw new Error("User not found");
        }
    
        // Extract friend IDs
        const friendIds = user.friends.map((friend) => friend._id);
    
        // Fetch users and their check-ins (including the user and their friends)
        const userIds = [userObjectId, ...friendIds];
        const users = await User.find({ _id: { $in: userIds } }).select("_id profilePic checkIns firstName lastName");
    
        let checkIns = [];
        for (const user of users) {
          if (user.checkIns && user.checkIns.length > 0) {
            const userCheckIns = await Promise.all(
              user.checkIns.map(async (checkIn) => {
                // ✅ Fetch Business Name using placeId
                const business = await Business.findOne({ placeId: checkIn.placeId }).select("businessName");
    
                // ✅ Process tagged users for the entire check-in
                let formattedTaggedUsers = [];
                if (Array.isArray(checkIn.taggedUsers) && checkIn.taggedUsers.length > 0) {
                  const taggedUsersData = await User.find({ _id: { $in: checkIn.taggedUsers } })
                    .select("_id firstName lastName profilePic");
    
                  formattedTaggedUsers = await Promise.all(
                    taggedUsersData.map(async (taggedUser) => ({
                      userId: taggedUser._id,
                      fullName: `${taggedUser.firstName} ${taggedUser.lastName}`,
                      profilePicUrl: taggedUser.profilePic?.photoKey
                        ? await generateDownloadPresignedUrl(taggedUser.profilePic.photoKey)
                        : null,
                    }))
                  );
                }
    
                // ✅ Process each photo to include full names for tagged users
                const photosWithUserNames = Array.isArray(checkIn.photos)
                  ? await Promise.all(
                      checkIn.photos.map(async (photo) => {
                        // ✅ Ensure `photo.taggedUsers` is an array before mapping
                        const taggedUserIds = Array.isArray(photo.taggedUsers)
                          ? photo.taggedUsers.map(tag => tag.userId).filter(Boolean) // Filter out undefined values
                          : [];
    
                        const taggedUserDetails = taggedUserIds.length > 0
                          ? await User.find({ _id: { $in: taggedUserIds } }, { firstName: 1, lastName: 1 })
                          : [];
    
                        const taggedUsersWithPositions = Array.isArray(photo.taggedUsers)
                          ? photo.taggedUsers.map(tag => {
                              const user = taggedUserDetails.find(u => u._id.toString() === tag.userId?.toString());
                              return {
                                userId: tag.userId,
                                fullName: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
                                x: tag.x || 0,
                                y: tag.y || 0
                              };
                            })
                          : [];
    
                          return {
                            _id: photo._id, // ✅ Ensure photo ObjectId is explicitly returned
                            photoKey: photo.photoKey,
                            uploadedBy: photo.uploadedBy,
                            uploadDate: photo.uploadDate,
                            description: photo.description,
                            url: await generateDownloadPresignedUrl(photo.photoKey) || "", // Ensure URL exists
                            taggedUsers: taggedUsersWithPositions
                          };
                      })
                    )
                  : [];
    
                return {
                  _id: checkIn._id,
                  userId: user._id,
                  fullName: `${user.firstName} ${user.lastName}`,
                  placeId: checkIn.placeId,
                  businessName: business ? business.businessName : "Unknown Business",
                  message: checkIn.message,
                  date: new Date(checkIn.date).toISOString(),
                  taggedUsers: formattedTaggedUsers, // ✅ Include formatted tagged users
                  photos: photosWithUserNames, // ✅ Photos with formatted tagged users
                  comments: checkIn.comments,
                  likes: checkIn.likes,
                  profilePicUrl: user.profilePic?.photoKey
                    ? await generateDownloadPresignedUrl(user.profilePic.photoKey)
                    : null,
                  type: "check-in",
                };
              })
            );
    
            checkIns.push(...userCheckIns);
          }
        }
    
        // **Sort by timestamp (newest to oldest)**
        checkIns.sort((a, b) => new Date(b.date) - new Date(a.date));
    
        return checkIns;
      } catch (error) {
        console.error("❌ Error fetching check-ins:", error);
        throw new Error("Failed to fetch check-ins");
      }
    },
    getUserAndFriendsInvites: async (_, { userId }) => {
      try {
        const user = await User.findById(userId).populate('friends').lean();
        if (!user) throw new Error("User not found");
    
        const friendIds = user.friends.map(f => f._id.toString());
    
        const userInvitesRaw = await ActivityInvite.find({
          $or: [
            { senderId: userId },
            { 'recipients.userId': userId }
          ]
        }).lean();
    
        const friendPublicInvitesRaw = await ActivityInvite.find({
          senderId: { $in: friendIds },
          isPublic: true,
        }).lean();
    
        const allInvites = [...userInvitesRaw, ...friendPublicInvitesRaw];
    
        const senderIds = [...new Set(allInvites.map(inv => inv.senderId.toString()))];
        const recipientUserIds = allInvites.flatMap(inv => inv.recipients.map(r => r.userId.toString()));
        const placeIds = allInvites.map(inv => inv.placeId).filter(Boolean);
    
        const [allUsers, allBusinesses] = await Promise.all([
          User.find({ _id: { $in: [...senderIds, ...recipientUserIds] } }).lean(),
          Business.find({ placeId: { $in: placeIds } }).lean()
        ]);
    
        const userMap = new Map(allUsers.map(u => [u._id.toString(), u]));
        const businessMap = new Map(allBusinesses.map(b => [b.placeId, b]));
    
        const enrichInvite = async (invite) => {
          const sender = userMap.get(invite.senderId.toString());
          const senderProfilePicUrl = sender?.profilePic?.photoKey
            ? await generateDownloadPresignedUrl(sender.profilePic.photoKey)
            : null;
    
          const enrichedRecipients = await Promise.all(
            invite.recipients.map(async (r) => {
              const recipientUser = userMap.get(r.userId.toString());
              const profilePicUrl = recipientUser?.profilePic?.photoKey
                ? await generateDownloadPresignedUrl(recipientUser.profilePic.photoKey)
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
    
          const business = businessMap.get(invite.placeId);
          const businessLogoUrl = business?.logoKey
            ? await generateDownloadPresignedUrl(business.logoKey)
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
            requests: invite.requests || [],
            isPublic: invite.isPublic,
            status: invite.status,
            likes: invite.likes || [],
            comments: invite.comments || [],
            createdAt: invite.createdAt.toISOString(),
          };
        };
    
        const resolvedInvites = await Promise.all(
          [...new Set(allInvites.map(inv => inv._id.toString()))]
            .map(id => allInvites.find(inv => inv._id.toString() === id))
            .map(enrichInvite)
        );
    
        const userInviteIds = new Set(userInvitesRaw.map(inv => inv._id.toString()));
        const userInvites = resolvedInvites.filter(inv => userInviteIds.has(inv._id.toString()));
        const friendPublicInvites = resolvedInvites.filter(inv => !userInviteIds.has(inv._id.toString()));
    
        return {
          user,
          userInvites,
          friendPublicInvites,
        };
      } catch (err) {
        console.error("❌ Error in getUserAndFriendsInvites resolver:", err);
        throw new Error("Failed to fetch user and friends' invites");
      }
    },                
    getUserActivity: async (_, { userId }, { dataSources }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error("Invalid userId format");
        }

        const reviews = await resolvers.Query.getUserAndFriendsReviews(_, { userId }, { dataSources }) || [];
        const checkIns = await resolvers.Query.getUserAndFriendsCheckIns(_, { userId }, { dataSources }) || [];
        const inviteData = await resolvers.Query.getUserAndFriendsInvites(_, { userId }, { dataSources });
        const invites = [
          ...(inviteData?.userInvites || []),
          ...(inviteData?.friendPublicInvites || [])
        ];

        // Ensure every post has a type
        const reviewsWithType = reviews.map(review => ({
          ...review,
          type: "review"
        }));
        const checkInsWithType = checkIns.map(checkIn => ({
          ...checkIn,
          type: "check-in"
        }));
        const invitesWithType = invites.map(invite => ({
          ...invite,
          type: "invite",
          timestamp: invite.createdAt // for consistent sorting
        }));

        // Combine and sort by date
        return [...reviewsWithType, ...checkInsWithType, ...invitesWithType].sort(
          (a, b) =>
            new Date(b.date || b.timestamp || b.createdAt) -
            new Date(a.date || a.timestamp || a.createdAt)
        );        
      } catch (error) {
        throw new Error("Failed to fetch user activity");
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
  Date: DateScalar,
};

// Export Apollo Server instance
const createApolloServer = () => {
  return new ApolloServer({
    typeDefs,
    resolvers,
    validationRules: [depthLimit(30)],
  });
};

module.exports = createApolloServer;
