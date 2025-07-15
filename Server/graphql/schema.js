const { ApolloServer } = require('@apollo/server');
const depthLimit = require('graphql-depth-limit');
const typeDefs = require('./typeDefs.js');
const { GraphQLScalarType, Kind } = require('graphql');
const { getUserFromToken } = require('../utils/auth.js');
const { getUserActivity } = require('./resolvers/getUserActivity.js');
const { getUserPosts } = require('./resolvers/getUserPosts.js');
const { getBusinessReviews } = require('./resolvers/getBusinessReviews.js');
const { getSuggestedFollows } = require('./resolvers/getSuggestedFollows.js');
const { userAndFollowingStories } = require('./resolvers/userAndFollowingStories.js');
const { storiesByUser } = require('./resolvers/storiesByUser.js');
const { getBusinessRatingSummaries } = require('./resolvers/getBusinessRatingSummaries.js');

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

const resolvers = {
  Query: {
    getUserPosts,
    getBusinessReviews,
    getUserActivity,
    getSuggestedFollows,
    userAndFollowingStories,
    storiesByUser,
    getBusinessRatingSummaries,
  },
  UserActivity: {
    __resolveType(obj) {
      switch (obj.type) {
        case 'review': return 'Review';
        case 'check-in': return 'CheckIn';
        case 'invite': return 'ActivityInvite';
        case 'sharedPost': return 'SharedPost';
        default: return null;
      }
    }
  },
  SharedContent: {
  __resolveType(obj) {
    switch (obj.type) {
      case 'review': return 'Review';
      case 'checkin': return 'CheckIn';
      case 'invite': return 'ActivityInvite';
      case 'promotion': return 'Promotion';
      case 'event': return 'Event';
      default:
        console.error('❌ Unknown type for SharedContent:', obj?.type, obj);
        return null;
    }
  },
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
