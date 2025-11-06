const mongoose = require('mongoose');
const Business = require('../../models/Business');
const HiddenPost = require('../../models/HiddenPosts');
const User = require('../../models/User');
const { Post } = require('../../models/Post'); // ✅ unified Post model
const {
  resolveTaggedPhotoUsers,
  enrichComments,
} = require('../../utils/userPosts');

const getAuthUserId = (ctx) =>
  ctx?.user?._id?.toString?.() || ctx?.user?.id || ctx?.user?.userId || null;

const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));
const oid   = (v) => new mongoose.Types.ObjectId(String(v));

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

async function privacyFilterForViewer(viewerId) {
  // If no viewer, only public posts are visible.
  if (!viewerId) return [{ privacy: 'public' }];

  // Viewer can always see their own posts.
  const viewer = await User.findById(viewerId).select('following').lean();
  const followingOids = (viewer?.following || []).map((id) => oid(id));

  const or = [{ ownerId: viewerId }, { privacy: 'public' }];
  if (followingOids.length) {
    or.push({ $and: [{ privacy: 'followers' }, { ownerId: { $in: followingOids } }] });
  }
  return or;
}

/**
 * getBusinessReviews(placeId, limit, after) -> [Post!]
 * Unified: returns canonical Post docs of type 'review' and 'check-in' for the place.
 */
const getPostsByPlace = async (_, { placeId, limit = 15, after }, context) => {
  try {
    if (!placeId) throw new Error('Invalid placeId');

    // Optional: confirm business exists
    const biz = await Business.findOne({ placeId }).lean();
    if (!biz) return [];

    // viewer + hidden set
    const viewerIdStr = getAuthUserId(context);
    const viewerId = viewerIdStr && isOid(viewerIdStr) ? oid(viewerIdStr) : null;

    let hiddenSet = new Set();
    if (viewerId) {
      const rows = await HiddenPost.find(
        { userId: viewerId, targetRef: 'Post' },
        { targetId: 1, _id: 0 }
      ).lean();
      hiddenSet = new Set(rows.map((r) => String(r.targetId)));
    }

    // privacy
    const privacyOr = await privacyFilterForViewer(viewerId);

    // query unified posts
    const base = {
      placeId,
      type: { $in: ['review', 'check-in'] },
      visibility: { $in: ['visible'] },
      $or: privacyOr,
      ...buildCursorQuery(after),
    };

    const posts = await Post.find(base)
      .sort({ sortDate: -1, _id: -1 })
      .limit(Math.min(Number(limit) || 15, 100))
      .lean();

    // filter hidden for this viewer
    const visible = posts.filter((p) => !hiddenSet.has(String(p._id)));

    // enrich media tag users + comment media as needed
    const enriched = await Promise.all(
      visible.map(async (p) => ({
        ...p,
        media: await resolveTaggedPhotoUsers(p.media || []),
        comments: await enrichComments(p.comments || []),
      }))
    );

    return enriched;
  } catch (error) {
    console.error('❌ Error in getBusinessReviews:', error);
    throw new Error('Failed to fetch business posts');
  }
};

module.exports = {
  getPostsByPlace,
};
