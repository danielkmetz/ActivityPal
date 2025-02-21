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

  type Review {
    _id: ID!
    businessName: String! # Added business name
    placeId: String! # Added placeId for business
    rating: Int!
    reviewText: String!
    date: Date!
    likes: [Like!]
    comments: [Comment!]
    userId: ID!
    fullName: String!
    profilePic: ProfilePic 
    profilePicUrl: String
    photos: [Photo!]
  }
  type Photo {
    _id: ID!
    photoKey: String!
    uploadedBy: String!
    description: String
    tags: [String]
    uploadDate: Date!
    url: String # ✅ Added field for pre-signed URL
  }
  type ProfilePic {
    _id: ID!
    photoKey: String!
    uploadedBy: String!
    description: String
    tags: [String]
    uploadDate: String!
  }
  type Like {
    userId: ID!
    fullName: String!
  }

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

  type Query {
    getUserAndFriendsReviews(userId: String!): [Review!]
    getUserReviews(userId: String!): [Review!]
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
      
      getUserReviews: async (_, { userId }) => {
        try {
            const userObjectId = new mongoose.Types.ObjectId(userId);
    
            // Fetch user's profilePic
            const user = await User.findById(userObjectId).select('_id profilePic');
            if (!user) {
                console.error(`❌ User with ID ${userId} not found`);
                throw new Error('User not found');
            }
    
            // Fetch businesses where this user has written reviews
            const businesses = await Business.find({ "reviews.userId": userObjectId }).lean();
    
            if (!businesses.length) {
                console.warn(`⚠️ No businesses found with reviews for userId ${userId}`);
                return [];
            }
    
            console.log(`🏢 Found ${businesses.length} businesses with reviews from userId ${userId}`);
    
            // Generate presigned URL for the profile pic (if exists)
            const photoKey = user.profilePic?.photoKey || null;
            const profilePicUrl = photoKey ? await generateDownloadPresignedUrl(photoKey) : null;
    
            // Extract relevant reviews, attach profilePic, and generate pre-signed URLs for photos
            let reviews = [];
            for (const business of businesses) {
                const businessReviews = await Promise.all(
                    business.reviews
                        .filter((review) => review.userId.toString() === userId) // Filter for this user only
                        .map(async (review) => {
                            // ✅ Check if review.photos exists before mapping
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
                                profilePic: user.profilePic || null, // ✅ Attach full profilePic object
                                profilePicUrl, // ✅ Attach pre-signed URL
                                photos: photosWithUrls, // ✅ Attach photos with pre-signed URLs
                            };
                        })
                );
    
                reviews.push(...businessReviews);
            }
    
            // **Sort by date (newest to oldest)**
            reviews.sort((a, b) => new Date(b.date) - new Date(a.date));
    
            return reviews;
        } catch (error) {
            console.error('❌ Error fetching user reviews:', error);
            throw new Error('Failed to fetch user reviews');
        }
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
