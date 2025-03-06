const { ApolloServer } = require('@apollo/server');
const { gql } = require('graphql-tag');
const mongoose = require('mongoose');
const User = require('../models/User'); // Import User Model
const Business = require('../models/Business'); // Import Review Model
const Reply = require('../models/Reply');
const Comment = require('../models/Comment.js');
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
    timestamp: String
    date: String
    photos: [Photo!]
    likes: [Like!]
    comments: [Comment!]
    profilePicUrl: String
    profilePic: ProfilePic
    taggedUsers: [TaggedUser!]
    type: String! # ✅ Used to distinguish reviews from check-ins
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
    comments: [Comment!]
    userId: ID!
    fullName: String!
    profilePic: ProfilePic
    profilePicUrl: String
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
    timestamp: String!
    photos: [Photo!]
    profilePic: ProfilePic
    profilePicUrl: String
    comments: [Comment!]
    likes: [Like]
    taggedUsers: [TaggedUser]
    type: String! # ✅ Used to distinguish between reviews and check-ins in frontend
  }

  type TaggedUser {
    _id: ID
    fullName: String
  }

  # ✅ Photo Type
  type Photo {
    _id: ID!
    photoKey: String!
    uploadedBy: String!
    description: String
    tags: [String]
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

  union UserPost = Review | CheckIn

  # ✅ Queries
  type Query {
    getUserAndFriendsReviews(userId: String!): [Review!]
    getUserPosts(userId: String!): [UserPost!]
    getBusinessReviews(placeId: String!): [Review!]
    getUserAndFriendsCheckIns(userId: String!): [CheckIn!]
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
      console.log("📥 Received GraphQL Request for getUserAndFriendsReviews with userId:", userId);

      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          console.error("❌ Invalid userId format:", userId);
          throw new Error("Invalid userId format");
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);
        console.log("🔍 Fetching user from database...");

        // Find user and get friends list
        const user = await User.findById(userObjectId).populate({ path: 'friends', select: '_id profilePic' });
        if (!user) {
          console.error("❌ User not found:", userId);
          throw new Error('User not found');
        }

        // Extract friend IDs
        const friendIds = user.friends.map((friend) => friend._id);
        console.log("👥 Friend IDs:", friendIds);

        // Find businesses where the user or their friends have written reviews
        console.log("🔍 Fetching businesses with reviews...");
        const businesses = await Business.find({
          "reviews.userId": { $in: [userObjectId, ...friendIds] },
        }).lean();

        if (!businesses.length) {
          console.warn(`⚠️ No businesses found with reviews for userId ${userId} or their friends`);
        } else {
          console.log(`🏢 Found ${businesses.length} businesses with reviews`);
        }

        // Fetch users' profilePic objects
        console.log("🔍 Fetching profile pictures for users...");
        const userIds = [userObjectId, ...friendIds];
        const users = await User.find({ _id: { $in: userIds } }).select('_id profilePic');

        const userPicMap = {};
        for (const user of users) {
          const photoKey = user.profilePic?.photoKey || null;
          userPicMap[user._id.toString()] = {
            profilePic: user.profilePic || null,
            profilePicUrl: photoKey ? await generateDownloadPresignedUrl(photoKey) : null
          };
        }

        let reviews = [];
        for (const business of businesses) {
          console.log(`📖 Processing reviews for business: ${business.businessName}`);

          const businessReviews = await Promise.all(
            business.reviews
              .filter((review) => userIds.some((id) => id.toString() === review.userId.toString()))
              .map(async (review) => {
                const photosWithUrls = review.photos && Array.isArray(review.photos)
                  ? await Promise.all(
                    review.photos.map(async (photo) => ({
                      ...photo,
                      url: await generateDownloadPresignedUrl(photo.photoKey),
                    }))
                  )
                  : [];

                return {
                  ...review,
                  businessName: business.businessName,
                  placeId: business.placeId,
                  date: new Date(review.date).toISOString(),
                  profilePic: userPicMap[review.userId]?.profilePic || null,
                  profilePicUrl: userPicMap[review.userId]?.profilePicUrl || null,
                  photos: photosWithUrls,
                };
              })
          );

          reviews.push(...businessReviews);
        }

        // **Sort by date (newest to oldest)**
        reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

        console.log("✅ Successfully fetched and processed reviews!");
        return reviews;
      } catch (error) {
        console.error('❌ Error fetching user and friends reviews:', error);
        throw new Error('Failed to fetch reviews');
      }
    },
    getUserPosts: async (_, { userId }) => {
      try {
        const userObjectId = new mongoose.Types.ObjectId(userId);
    
        // Fetch user profile pic
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
                const photosWithUrls = review.photos
                  ? await Promise.all(
                      review.photos.map(async (photo) => ({
                        ...photo,
                        url: await generateDownloadPresignedUrl(photo.photoKey),
                      }))
                    )
                  : [];
    
                return {
                  __typename: "Review", // ✅ GraphQL needs this field for unions
                  ...review,
                  businessName: business.businessName,
                  placeId: business.placeId,
                  date: new Date(review.date).toISOString(),
                  profilePic: user.profilePic || null,
                  profilePicUrl,
                  photos: photosWithUrls,
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
              const photosWithUrls = checkIn.photos
                ? await Promise.all(
                    checkIn.photos.map(async (photo) => ({
                      ...photo,
                      url: await generateDownloadPresignedUrl(photo.photoKey),
                    }))
                  )
                : [];
    
              let businessName = null;
              if (checkIn.placeId) {
                const business = await Business.findOne({ placeId: checkIn.placeId }).select('businessName');
                businessName = business ? business.businessName : null;
              }
    
              let taggedUsers = [];
              if (checkIn.taggedUsers && checkIn.taggedUsers.length > 0) {
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
                __typename: "CheckIn", // ✅ GraphQL needs this field for unions
                _id: checkIn._id,
                userId,
                fullName: `${user.firstName} ${user.lastName}`,
                message: checkIn.message,
                date: new Date(checkIn.timestamp).toISOString(),
                photos: photosWithUrls,
                likes: checkIn.likes || [],
                comments: checkIn.comments || [],
                taggedUsers,
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
      console.log("📥 Fetching reviews for placeId:", placeId);

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

        console.log(`🏢 Found business: ${business.businessName} with reviews`);

        // Extract userIds from reviews
        const userIds = business.reviews.map((review) => review.userId);

        // Fetch user profile pictures
        console.log("🔍 Fetching profile pictures for users...");
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
            // Fetch pre-signed URLs for review photos
            let photosWithUrls = [];
            if (review.photos && Array.isArray(review.photos)) {
              photosWithUrls = await Promise.all(
                review.photos.map(async (photo) => ({
                  ...photo,
                  url: await generateDownloadPresignedUrl(photo.photoKey),
                }))
              );
            }

            return {
              ...review,
              businessName: business.businessName,
              placeId: business.placeId,
              date: new Date(review.date).toISOString(),
              profilePic: userPicMap[review.userId]?.profilePic || null,
              profilePicUrl: userPicMap[review.userId]?.profilePicUrl || null,
              photos: photosWithUrls, // ✅ Review photos with pre-signed URLs
            };
          })
        );

        // **Sort by date (newest first)**
        reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

        console.log(`✅ Successfully processed ${reviews.length} reviews for placeId ${placeId}`);
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
                // ✅ Fetch tagged users' full names
                const taggedUsers = await User.find({ _id: { $in: checkIn.taggedUsers } })
                  .select("_id firstName lastName profilePic");
    
                // ✅ Format tagged users
                const formattedTaggedUsers = await Promise.all(taggedUsers.map(async (taggedUser) => ({
                  _id: taggedUser._id,
                  fullName: `${taggedUser.firstName} ${taggedUser.lastName}`,
                  profilePicUrl: taggedUser.profilePic?.photoKey
                    ? await generateDownloadPresignedUrl(taggedUser.profilePic.photoKey)
                    : null,
                })));
    
                // ✅ Generate pre-signed URLs for photos
                const photosWithUrls = checkIn.photos && Array.isArray(checkIn.photos)
                  ? await Promise.all(
                    checkIn.photos.map(async (photo) => ({
                      ...photo,
                      url: await generateDownloadPresignedUrl(photo.photoKey),
                    }))
                  )
                  : [];
    
                return {
                  _id: checkIn._id,
                  userId: user._id,
                  fullName: `${user.firstName} ${user.lastName}`,
                  placeId: checkIn.placeId,
                  businessName: business ? business.businessName : "Unknown Business",
                  message: checkIn.message,
                  timestamp: new Date(checkIn.timestamp).toISOString(),
                  taggedUsers: formattedTaggedUsers, // ✅ Include formatted tagged users
                  photos: photosWithUrls,
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
        checkIns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
        return checkIns;
      } catch (error) {
        console.error("❌ Error fetching check-ins:", error);
        throw new Error("Failed to fetch check-ins");
      }
    },    
    getUserActivity: async (_, { userId }, { dataSources }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          throw new Error("Invalid userId format");
        }

        const reviews = await resolvers.Query.getUserAndFriendsReviews(_, { userId }, { dataSources }) || [];
        const checkIns = await resolvers.Query.getUserAndFriendsCheckIns(_, { userId }, { dataSources }) || [];

        // Ensure every review has a type
        const reviewsWithType = reviews.map(review => ({
          ...review,
          type: "review"
        }));

        // Ensure every check-in has a type
        const checkInsWithType = checkIns.map(checkIn => ({
          ...checkIn,
          type: "check-in"
        }));

        // Combine and sort by date
        return [...reviewsWithType, ...checkInsWithType].sort(
          (a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp)
        );
      } catch (error) {
        throw new Error("Failed to fetch user activity");
      }
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
  });
};

module.exports = createApolloServer;
