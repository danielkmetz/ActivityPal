const { GraphQLError } = require('graphql');
const User = require('../../models/User');
const { Post } = require('../../models/Post');
const { getHiddenIdsForUser } = require('../../utils/hiddenTags');
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse');
const { buildCursorQuery } = require('../../utils/posts/buildCursorQuery');
const { oid, isOid } = require('../../utils/posts/oid');

const getAuthUserId = (ctx) => ctx?.user?._id?.toString?.() || ctx?.user?.id || ctx?.user?.userId || null;

/**
 * getUserTaggedPosts(userId, limit, after) -> [Post!]
 * Lists posts authored by others where `userId` is tagged (post-level or media-level),
 * filtered by viewer privacy and hidden settings, then hydrated.
 */
const getUserTaggedPosts = async (_, { userId, limit = 15, after }, context) => {
  try {
    if (!isOid(userId)) {
      throw new GraphQLError('Invalid userId', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const taggedUserId = oid(userId); // profile we're viewing

    const viewerIdStr = getAuthUserId(context);
    const viewerId = viewerIdStr && isOid(viewerIdStr) ? oid(viewerIdStr) : null;

    // ensure target user exists
    const exists = await User.exists({ _id: taggedUserId });
    if (!exists) {
      throw new GraphQLError('User not found', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    // viewer's following (for followers-only privacy gating), regardless of whose profile we view
    let viewerFollowingOids = [];
    if (viewerId) {
      const viewer = await User.findById(viewerId).select('following').lean();
      viewerFollowingOids = (viewer?.following || []).map((id) => oid(id));
    }

    // posts this profile owner hid from their tagged tab
    const ownerHiddenIds = await getHiddenIdsForUser(taggedUserId); // [ObjectId|string]
    const ownerHiddenOidSet = new Set((ownerHiddenIds || []).map((x) => String(x)));

    // privacy filter from the viewer's perspective
    const privacyOr = viewerId
      ? [
          // viewer always sees their own posts (although ownerId != taggedUserId in base)
          { ownerId: viewerId },
          { privacy: 'public' },
          ...(viewerFollowingOids.length
            ? [
                {
                  $and: [
                    { privacy: 'followers' },
                    { ownerId: { $in: viewerFollowingOids } },
                  ],
                },
              ]
            : []),
        ]
      : [{ privacy: 'public' }];

    // cursor
    const cursorQuery = buildCursorQuery(after);

    // query: posts by others where target user is tagged (post-level or media-level)
    const base = {
      ownerId: { $ne: taggedUserId }, // only posts by *others*
      $or: [
        { taggedUsers: taggedUserId },
        { 'media.taggedUsers.userId': taggedUserId },
      ],
      $and: [
        {
          // if you still have legacy docs missing visibility, mirror getUserPosts behavior:
          $or: [
            { visibility: { $in: ['visible'] } },
            { visibility: { $exists: false } },
          ],
        },
        { $or: privacyOr },
      ],
      ...cursorQuery,
    };

    const safeLimit = Math.min(Math.max(Number(limit) || 15, 1), 100);

    const items = await Post.find(base)
      .sort({ sortDate: -1, _id: -1 })
      .limit(safeLimit)
      .lean();

    if (!items.length) return [];

    // filter out posts the *profile owner* hid from their tagged tab
    const visible = items.filter((p) => !ownerHiddenOidSet.has(String(p._id)));

    if (!visible.length) return [];

    // hydrate/enrich via shared pipeline (global hidden handled there)
    const enriched = await hydrateManyPostsForResponse(visible, {
      viewerId: viewerIdStr || null,
    });

    return enriched;
  } catch (error) {
    if (error instanceof GraphQLError) throw error;

    throw new GraphQLError('[Resolver Error]', {
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
        originalMessage: error.message,
      },
    });
  }
};

module.exports = { getUserTaggedPosts };
