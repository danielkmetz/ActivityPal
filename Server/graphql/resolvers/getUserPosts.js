const mongoose = require('mongoose');
const User = require('../../models/User');
const HiddenPost = require('../../models/HiddenPosts');
const Business = require('../../models/Business');
const { Post } = require('../../models/Post');
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));

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

// (optional) normalize allowed types if you want to gate the input
const ALLOWED_TYPES = new Set([
  'review', 'check-in', 'invite', 'event', 'promotion', 'sharedPost', 'liveStream',
]);
const normalizeTypesArg = (types) => {
  if (!types) return null;
  const list = Array.isArray(types) ? types : String(types).split(',');
  const cleaned = list.map((t) => String(t).trim()).filter(Boolean);
  const allowed = cleaned.filter((t) => ALLOWED_TYPES.has(t));
  return allowed.length ? allowed : null;
};

// same helper used elsewhere
async function attachBusinessNameIfMissing(post) {
  if (!post || post.businessName || !post.placeId) return post;
  const biz = await Business.findOne({ placeId: post.placeId }).select('businessName').lean();
  if (biz?.businessName) post.businessName = biz.businessName;
  return post;
}

const getUserPosts = async (_, { userId, types, limit = 15, after }, context) => {
  try {
    if (!isOid(userId)) throw new Error('Invalid userId format');
    const targetId = oid(userId);

    // viewer
    const viewerIdStr =
      context?.user?._id?.toString?.() ||
      context?.user?.id ||
      context?.user?.userId ||
      null;
    const viewerId = viewerIdStr && isOid(viewerIdStr) ? oid(viewerIdStr) : null;

    // privacy scope
    let allowedPrivacy = ['public'];
    if (viewerId && viewerId.equals(targetId)) {
      allowedPrivacy = ['public', 'followers', 'private', 'unlisted'];
    } else if (viewerId) {
      const viewer = await User.findById(viewerId).select('following').lean();
      const followsTarget = !!(viewer?.following || []).some(
        (id) => String(id) === String(targetId)
      );
      allowedPrivacy = followsTarget ? ['public', 'followers'] : ['public'];
    }

    // hidden posts for this viewer
    let hiddenIds = new Set();
    if (viewerId) {
      const rows = await HiddenPost.find(
        { userId: viewerId, targetRef: 'Post' },
        { targetId: 1, _id: 0 }
      ).lean();
      hiddenIds = new Set(rows.map((r) => String(r.targetId)));
    }

    // type filter (optional)
    const typeList = normalizeTypesArg(types);
    const typeFilter = typeList ? { type: { $in: typeList } } : {};

    // base filter (allow legacy docs missing privacy/visibility)
    const base = {
      ownerId: targetId,
      ...typeFilter,
      $and: [
        { $or: [{ visibility: { $in: ['visible'] } }, { visibility: { $exists: false } }] },
        { $or: [{ privacy: { $in: allowedPrivacy } }, { privacy: { $exists: false } }] },
      ],
      ...buildCursorQuery(after),
    };

    // fetch canonical posts
    const items = await Post.find(base)
      .sort({ sortDate: -1, _id: -1 })
      .limit(Math.min(Number(limit) || 15, 100))
      .lean();

    // apply hidden filter
    const visible = items.filter((p) => !hiddenIds.has(String(p._id)));
    if (!visible.length) return [];

    // hydrate + enrich (batch), attach businessName on top/original/snapshot
    const enriched = await hydrateManyPostsForResponse(visible, {
      viewerId: viewerId ? String(viewerId) : null,
      attachBusinessNameIfMissing,
    });

    return enriched;
  } catch (error) {
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = { getUserPosts };
