const mongoose = require('mongoose');
const { GraphQLError } = require('graphql');
const User = require('../../models/User');
const HiddenPost = require('../../models/HiddenPosts');
const { Post } = require('../../models/Post'); // unified model
const { getAuthorExclusionSets } = require('../../services/blockService');
const { getPresignedUrl } = require('../../utils/cachePresignedUrl');
const {
  fetchUserSummaries,
  collectUserIdsFromPosts,
  enrichPostUniversal,
} = require('../../utils/enrichPosts');

// ----- helpers -----
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));

const DEFAULT_LIMIT = 15;
const VISIBLE_STATES = ['visible']; // adjust if you use others

function buildCursorQuery(after) {
  if (!after?.sortDate || !after?.id || !isOid(after.id)) return {};
  const sd = new Date(after.sortDate);
  return {
    $or: [
      { sortDate: { $lt: sd } },
      { sortDate: sd, _id: { $lt: oid(after.id) } }
    ]
  };
}

// Optional type allowlist (keeps client safe)
const ALLOWED_TYPES = new Set([
  'review',
  'check-in',
  'invite',
  'event',
  'promotion',
  'sharedPost',
  'liveStream',
]);

function normalizeTypesArg(types) {
  if (!types) return null;
  const list = Array.isArray(types) ? types : String(types).split(',');
  const cleaned = list.map(t => String(t).trim()).filter(Boolean);
  const allowed = cleaned.filter(t => ALLOWED_TYPES.has(t));
  return allowed.length ? allowed : null;
}

// Build privacy filter for "me + following"
// - always include my own posts (any privacy)
// - for followed authors include public/followers
function buildPrivacyAuthorFilter(meId, authorOids) {
  return {
    $and: [
      { ownerId: { $in: authorOids } },
      {
        $or: [
          { ownerId: oid(meId) }, // I can see all mine
          { privacy: { $in: ['public', 'followers'] } },
        ],
      },
    ],
  };
}

async function getHiddenSets(userId) {
  // New world: you’ll likely store targetRef === 'Post'. We also tolerate any legacy rows.
  const rows = await HiddenPost.find(
    { userId: oid(userId) },
    { targetRef: 1, targetId: 1, _id: 0 }
  ).lean();

  const byPostId = new Set();           // for targetRef === 'Post'
  const byTypedKey = new Set();         // for legacy typed keys: `${type}:${id}`

  for (const r of rows) {
    const ref = String(r.targetRef || '').toLowerCase();
    const id = String(r.targetId || '');
    if (!id) continue;
    if (ref === 'post') byPostId.add(id);
    // legacy support: review/check-in/etc.
    if (ref) byTypedKey.add(`${ref}:${id}`);
  }
  return { byPostId, byTypedKey };
}

// ----- main resolver -----
/**
 * Query: getUserActivity(types, limit, after, userLat, userLng)
 * Returns: [Post!] (canonical Post docs; resolvers will hydrate unions/owners)
 */
const getUserActivity = async (_, { types, limit = DEFAULT_LIMIT, after }, context) => {
  // auth
  const meId = context?.user?._id?.toString?.() || context?.user?.id || context?.user?.userId;
  if (!meId || !isOid(meId)) {
    throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  // following
  const me = await User.findById(oid(meId)).select('following').lean();
  if (!me) throw new GraphQLError('User not found', { extensions: { code: 'BAD_USER_INPUT' } });

  const followingStr = (me.following || []).map(String);
  const { excludeAuthorIds: raw = [] } =
    (await getAuthorExclusionSets(meId).catch(() => ({ excludeAuthorIds: [] }))) || {};
  const authorOids = [meId, ...followingStr]
    .filter((id) => !raw.map(String).includes(String(id)))
    .map(oid);
  if (!authorOids.length) return [];

  // hidden sets
  const { byPostId, byTypedKey } = await getHiddenSets(meId);

  // filter
  const typeFilter = normalizeTypesArg(types);
  const base = {
    type: typeFilter ? { $in: typeFilter } : { $exists: true },
    visibility: { $in: VISIBLE_STATES },
    ...buildPrivacyAuthorFilter(meId, authorOids),
    ...buildCursorQuery(after),
  };

  // fetch
  const items = await Post.find(base)
    .sort({ sortDate: -1, _id: -1 })
    .limit(Math.min(Number(limit) || DEFAULT_LIMIT, 100))
    .lean();

  // hide
  const visible = items.filter((p) => {
    const id = String(p._id);
    if (byPostId.has(id)) return false;
    if (byTypedKey.has(`${String(p.type).toLowerCase()}:${id}`)) return false;
    return true;
  });

  // sign media (getPresignedUrl already caches)
  const withUrls = await Promise.all(
    visible.map(async (p) => {
      const media = await Promise.all(
        (p.media || []).map(async (m) => ({
          ...m,
          url: m?.url || (m?.photoKey ? await getPresignedUrl(m.photoKey) : null),
        }))
      );
      return { ...p, media };
    })
  );

  return withUrls;
};

module.exports = { getUserActivity };
