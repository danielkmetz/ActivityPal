const { ApolloServer } = require('@apollo/server');
const depthLimit = require('graphql-depth-limit');
const { GraphQLScalarType, Kind } = require('graphql');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const typeDefs = require('./typeDefs.js');

// Query resolvers (Post-based)
const { getUserActivity } = require('./resolvers/getUserActivity.js');
const { getUserPosts } = require('./resolvers/getUserPosts.js');
const { getPostsByPlace } = require('./resolvers/getPostsByPlace.js'); // reused as getPostsByPlace
const { getSuggestedFollows } = require('./resolvers/getSuggestedFollows.js');
const { getBusinessRatingSummaries } = require('./resolvers/getBusinessRatingSummaries.js');
const { getUserTaggedPosts } = require('./resolvers/getUserTaggedPosts.js');
const { getUserInvites } = require('./resolvers/getUserInvites.js');

// Models used in field resolvers
const User = require('../models/User');
const Business = require('../models/Business');
const { getUserFromToken } = require('../utils/auth.js');

// ---------------- Scalars ----------------
const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'ISO-8601 date (no time assumptions)',
  serialize(value) { return new Date(value).toISOString(); },
  parseValue(value) { return new Date(value); },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) return new Date(ast.value);
    return null;
  }
});

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'ISO-8601 date-time',
  serialize(value) { return new Date(value).toISOString(); },
  parseValue(value) { return new Date(value); },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) return new Date(ast.value);
    return null;
  }
});

// Lightweight JSON scalar (vars preferred; inline literals return null)
const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize(value) { return value; },
  parseValue(value) { return value; },
  parseLiteral() { return null; }
});

// ---------------- Depth-limit guard ----------------
const safeDepthLimit = (maxDepth, options) => {
  const original = depthLimit(maxDepth, options);
  return (context) => {
    const ruleVisitor = original(context);
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

// ---------------- Apollo setup ----------------
const resolvers = {
  Query: {
    // Post-based queries
    getUserActivity,
    getUserPosts,
    getPostsByPlace,
    getUserTaggedPosts,
    getUserInvites,

    // Other queries you already have
    getSuggestedFollows,
    getBusinessRatingSummaries,
  },

  // ------- Field resolvers for the unified Post shape -------
  Post: {
    // Resolve the owner union from ownerId/ownerModel
    owner: async (post) => {
      if (!post?.ownerId) return null;
      if (post.ownerModel === 'Business') {
        return Business.findById(post.ownerId).lean();
      }
      return User.findById(post.ownerId).lean();
    },
    // Pass-through helpers (kept explicit for clarity)
    details: (post) => post.details || null,
    shared: (post) => post.shared || null,
    refs: (post) => post.refs || null,
    businessName: async (post) => {
      if (post.businessName) return post.businessName; // if you ever store it on the doc
      if (!post.placeId) return null;
      const b = await Business.findOne({ placeId: post.placeId })
        .select('businessName')
        .lean();
      return b?.businessName || null;
    },
  },

  User: {
    id: (u) => u.id || (u._id && String(u._id)),
    fullName: (u) => {
      if (u.fullName) return u.fullName; // allow pre-enriched
      const first = u?.firstName || '';
      const last  = u?.lastName  || '';
      const name = `${first} ${last}`.trim();
      return name || null;
    },
    profilePicUrl: async (u) => {
      if (u.profilePicUrl) return u.profilePicUrl; // allow pre-enriched
      const key = u?.profilePic?.photoKey;
      return key ? await getPresignedUrl(key) : null;
    },
  },

  Business: {
    id: (b) => b.id || (b._id && String(b._id)),
    logoUrl: async (b) => {
      if (b.logoUrl) return b.logoUrl; // allow pre-enriched
      const key = b?.logoKey;
      return key ? await getPresignedUrl(key) : null;
    },
  },

  // Discriminate the Post.details union based on present fields
  PostDetails: {
    __resolveType(obj) {
      if (!obj || typeof obj !== 'object') return null;
      if ('reviewText' in obj || 'rating' in obj) return 'ReviewDetails';
      if ('dateTime' in obj || 'recipients' in obj) return 'InviteDetails';
      if ('startsAt' in obj || 'endsAt' in obj || 'hostId' in obj) return 'EventDetails';
      if ('discountPct' in obj || 'code' in obj) return 'PromotionDetails';
      if ('date' in obj) return 'CheckInDetails';
      return null;
    },
  },

  // Owner union for Post.owner (and anywhere else you reuse it)
  OriginalOwner: {
    __resolveType(obj) {
      if (!obj || typeof obj !== 'object') return null;
      if ('placeId' in obj || 'businessName' in obj || 'logoUrl' in obj) return 'Business';
      return 'User';
    },
  },

  // Scalars
  Date: DateScalar,
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
};

const createApolloServer = () => {
  return new ApolloServer({
    typeDefs,
    resolvers,
    validationRules: [
      (context) => {
        try { return safeDepthLimit(30)(context); }
        catch (e) { throw e; }
      },
    ],
    plugins: [
      {
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
        },
      },
    ],
    context: async ({ req }) => {
      const user = await getUserFromToken(req);
      return { user };
    },
  });
};

module.exports = createApolloServer;
