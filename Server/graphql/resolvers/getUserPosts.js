const mongoose = require('mongoose');
const User = require('../../models/User');
const Business = require('../../models/Business');
const { Post } = require('../../models/Post');
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse');
const { buildCursorQuery } = require('../../utils/posts/buildCursorQuery');
const { oid, isOid } = require('../../utils/posts/oid');
const { normalizeTypesArg } = require('../../utils/posts/normalizeTypesArg');

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
      // self: see everything
      allowedPrivacy = ['public', 'followers', 'private', 'unlisted'];
    } else if (viewerId) {
      const viewer = await User.findById(viewerId).select('following').lean();
      const followsTarget = !!(viewer?.following || []).some(
        (id) => String(id) === String(targetId)
      );
      allowedPrivacy = followsTarget ? ['public', 'followers'] : ['public'];
    }

    const typeList = normalizeTypesArg(types);
    
    if (Array.isArray(typeList) && typeList.length === 0) {
      return [];
    }
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

    if (!items.length) return [];

    const enriched = await hydrateManyPostsForResponse(items, {
      viewerId: viewerIdStr || null,        // used by filterHiddenPostsForViewer
      attachBusinessNameIfMissing,
    });

    return enriched;
  } catch (error) {
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = { getUserPosts };
