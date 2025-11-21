const mongoose = require('mongoose');
const User = require('../../models/User');
const { Post } = require('../../models/Post');              // ✅ unified Post model
const { getHiddenIdsForUser } = require('../../utils/hiddenTags'); // -> Post ids
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse'); // ⬅️ adjust path if needed

const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));
const oid = (v) => new mongoose.Types.ObjectId(String(v));

const getAuthUserId = (ctx) =>
  ctx?.user?._id?.toString?.() || ctx?.user?.id || ctx?.user?.userId || null;

function buildCursorQuery(after) {
  if (!after?.sortDate || !after?.id || !isOid(after.id)) return {};
  const sd = new Date(after.sortDate);
  return {
    $or: [
      { sortDate: { $lt: sd } },
      { sortDate: sd, _id: { $lt: oid(after.id) } },
    ],
  };
}

/**
 * getUserTaggedPosts(userId, limit, after) -> [Post!]
 * Lists posts authored by others where `userId` is tagged (post-level or media-level),
 * filtered by viewer privacy and hidden settings, then hydrated via postHydration helpers.
 */
const getUserTaggedPosts = async (_, { userId, limit = 15, after }, context) => {
  const startedAt = Date.now(); // keep if you want, or remove if unused

  try {
    const viewerIdStr = getAuthUserId(context); // who is looking (string or null)

    if (!isOid(userId)) {
      throw new Error('Invalid userId');
    }

    const taggedUserId = oid(userId); // the profile we're viewing
    const viewerId = viewerIdStr && isOid(viewerIdStr) ? oid(viewerIdStr) : null;

    // ensure target user exists
    const exists = await User.exists({ _id: taggedUserId });
    if (!exists) throw new Error('User not found');

    // viewer privacy scope
    let viewerFollowingOids = [];
    if (viewerId && !viewerId.equals(taggedUserId)) {
      const viewer = await User.findById(viewerId).select('following').lean();
      viewerFollowingOids = (viewer?.following || []).map((id) => oid(id));
    }

    // posts this profile owner hid from their tagged tab
    const ownerHiddenIds = await getHiddenIdsForUser(taggedUserId); // -> [ObjectId|string]
    const ownerHiddenOidSet = new Set((ownerHiddenIds || []).map((x) => String(x)));

    // Global hidden is handled inside hydrateManyPostsForResponse via filterHiddenPostsForViewer.

    // build privacy filter
    const privacyOr = viewerId
      ? [
          { ownerId: viewerId }, // viewer always sees their own posts (though ownerId != taggedUserId below)
          { privacy: 'public' },
          ...(viewerFollowingOids.length
            ? [{ $and: [{ privacy: 'followers' }, { ownerId: { $in: viewerFollowingOids } }] }]
            : []),
        ]
      : [{ privacy: 'public' }];

    // cursor
    const cursorQuery = buildCursorQuery(after);

    // query: posts by others where target user is tagged (post-level or media-level)
    const base = {
      ownerId: { $ne: taggedUserId }, // only posts by *others*
      visibility: { $in: ['visible'] },
      $or: [
        { taggedUsers: taggedUserId },
        { 'media.taggedUsers.userId': taggedUserId },
      ],
      $and: [{ $or: privacyOr }],
      ...cursorQuery,
    };

    const safeLimit = Math.min(Number(limit) || 15, 100);

    // fetch raw posts
    const items = await Post.find(base)
      .sort({ sortDate: -1, _id: -1 })
      .limit(safeLimit)
      .lean();

    // filter out posts the *profile owner* hid from their tagged tab
    const visible = items.filter((p) => !ownerHiddenOidSet.has(String(p._id)));

    // hydrate/enrich via shared pipeline (global hidden handled there)
    const enriched = await hydrateManyPostsForResponse(visible, {
      viewerId: viewerIdStr || null,
    });

    return enriched;
  } catch (error) {
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = { getUserTaggedPosts };
