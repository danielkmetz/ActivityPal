const mongoose = require('mongoose');
const { GraphQLError } = require('graphql');
const User = require('../../models/User');
const Business = require('../../models/Business'); // for businessName attach
const { Post } = require('../../models/Post');
const { getAuthorExclusionSets } = require('../../services/blockService');
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));

const DEFAULT_LIMIT = 5;
const VISIBLE_STATES = ['visible'];

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

const ALLOWED_TYPES = new Set([
  'review', 'check-in', 'invite', 'event', 'promotion', 'sharedPost', 'liveStream',
]);

function normalizeTypesArg(types) {
  if (!types) return null;
  const list = Array.isArray(types) ? types : String(types).split(',');
  const cleaned = list.map((t) => String(t).trim()).filter(Boolean);
  const allowed = cleaned.filter((t) => ALLOWED_TYPES.has(t));
  return allowed.length ? allowed : null;
}

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

  const authorOids = [meId, ...followingStr]
    .filter((id) => !raw.map(String).includes(String(id)))
    .map(oid);

  if (!authorOids.length) return [];

  const typeFilter = normalizeTypesArg(types);

  const base = {
    type: typeFilter ? { $in: typeFilter } : { $exists: true },
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
  });

  return enriched;
};

module.exports = { getUserActivity };
