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
  OriginalOwner: {
    __resolveType(obj) {
      if (obj.businessName || obj.placeId || obj.logoUrl) {
        return 'Business';
      }
      if (obj.firstName || obj.lastName || obj.profilePicUrl) {
        return 'User';
      }

      return null;
    }
  },
  SharedContent: {
    __resolveType(obj) {
      if (obj.__typename) return obj.__typename;

      // Fallbacks for safety
      const map = {
        review: 'Review',
        'check-in': 'CheckIn',
        checkIn: 'CheckIn',
        invite: 'ActivityInvite',
        promotion: 'Promotion',
        event: 'Event',
      };

      if (map[obj.originalPostType]) return map[obj.originalPostType];

      console.error('❌ Cannot resolve SharedContent type:', JSON.stringify(obj, null, 2));
      return null;
    }
  },
  UserPost: {
    __resolveType(obj) {
      if (obj.type === 'review' || obj.reviewText !== undefined) return 'Review';
      if (obj.type === 'check-in' || obj.message !== undefined) return 'CheckIn';
      if (obj.type === 'checkIn' || obj.message !== undefined) return 'CheckIn';
      if (obj.type === 'sharedPost' || obj.original !== undefined) return 'SharedPost';
      if (obj.type === 'promotion' || obj.message !== undefined) return 'Promotion';
      if (obj.type === 'event' || obj.original !== undefined) return 'Event';
      return null; // ← THIS is what causes graphql-depth-limit to explode
    }
  },
  Date: DateScalar,
};

// Defensive wrapper around graphql-depth-limit
const safeDepthLimit = (maxDepth, options) => {
  const originalRule = depthLimit(maxDepth, options);
  return (context) => {
    const ruleVisitor = originalRule(context);
    return {
      ...ruleVisitor,
      Field(node, ...rest) {
        if (!node || typeof node.kind !== 'string') {
          console.warn('⚠️ Skipping depth check on invalid AST node:', node);
          return;
        }
        return ruleVisitor.Field?.(node, ...rest);
      },
    };
  };
};

const createApolloServer = () => {
  return new ApolloServer({
    typeDefs,
    resolvers,
    validationRules: [
      (context) => {
        try {
          return safeDepthLimit(30)(context);
        } catch (e) {
          throw e;
        }
      }
    ],
    plugins: [{
      async requestDidStart() {
        return {
          didEncounterErrors(ctx) {
            ctx.errors.forEach((err) => {
              console.error('[Apollo Error]', {
                message: err.message,
                locations: err.locations,
                path: err.path,
                stack: err.originalError?.stack,
              });
            });
          },
        };
      }
    }],
    context: async ({ req }) => {
      const user = await getUserFromToken(req);
      return { user };
    },
  });
};

module.exports = createApolloServer;
