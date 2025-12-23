const mongoose = require('mongoose');
const { GraphQLError } = require('graphql');
const User = require('../../models/User');
const Business = require('../../models/Business'); // for businessName attach
const { Post } = require('../../models/Post');
const { getAuthorExclusionSets } = require('../../services/blockService');
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse');
const { buildCursorQuery } = require('../../utils/posts/buildCursorQuery');
const { oid, isOid } = require('../../utils/posts/oid');
const { normalizeTypesArg } = require('../../utils/posts/normalizeTypesArg');

const DEFAULT_LIMIT = 5;
const VISIBLE_STATES = ['visible'];

function buildPrivacyAuthorFilter(meId, authorOids) {
  return {
    $and: [
      { ownerId: { $in: authorOids } },
      { $or: [{ ownerId: oid(meId) }, { privacy: { $in: ['public', 'followers'] } }] },
    ],
  };
}

// simple attach that mirrors your route util
async function attachBusinessNameIfMissing(post) {
  if (!post || post.businessName || !post.placeId) return post;
  const biz = await Business.findOne({ placeId: post.placeId }).select('businessName').lean();
  if (biz?.businessName) post.businessName = biz.businessName;
  return post;
}

const getUserActivity = async (_, { types, limit = DEFAULT_LIMIT, after }, context) => {
  const meId =
    context?.user?._id?.toString?.() ||
    context?.user?.id ||
    context?.user?.userId;

  if (!meId || !isOid(meId)) {
    throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  const me = await User.findById(oid(meId)).select('following').lean();
  if (!me) {
    throw new GraphQLError('User not found', { extensions: { code: 'BAD_USER_INPUT' } });
  }

  const followingStr = (me.following || []).map(String);

  // block / exclusion logic
  const { excludeAuthorIds: raw = [] } =
    (await getAuthorExclusionSets(meId).catch(() => ({ excludeAuthorIds: [] }))) || {};

  const excludeSet = new Set((raw || []).map(String));

  const authorOids = [meId, ...followingStr]
    .filter((id) => !excludeSet.has(String(id)))
    .map(oid);

  if (!authorOids.length) return [];

  const typeFilter = normalizeTypesArg(types);

  if (Array.isArray(typeFilter) && typeFilter.length === 0) {
    // user passed only invalid types → no posts match
    return [];
  }

  const base = {
    ...(Array.isArray(typeFilter) && typeFilter.length
      ? { type: { $in: typeFilter } }
      : {}), // no 'type' predicate when no filter given
    visibility: { $in: VISIBLE_STATES },
    ...buildPrivacyAuthorFilter(meId, authorOids),
    ...buildCursorQuery(after),
  };

  const items = await Post.find(base)
    .sort({ sortDate: -1, _id: -1 })
    .limit(Math.min(Number(limit) || DEFAULT_LIMIT, 100))
    .lean();

  if (!items.length) return [];

  // ✅ Global hidden posts are now handled inside hydrateManyPostsForResponse
  const enriched = await hydrateManyPostsForResponse(items, {
    viewerId: meId,
    attachBusinessNameIfMissing,
    applyInviteFeedFilter: true,
  });

  return enriched;
};

module.exports = { getUserActivity };
