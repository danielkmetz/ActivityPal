const mongoose = require('mongoose');
const User = require('../../models/User');
const HiddenPost = require('../../models/HiddenPosts');
const { Post } = require('../../models/Post');
const { resolveTaggedPhotoUsers } = require('../../utils/userPosts');

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

const getUserPosts = async (_, { userId, types, limit = 15, after }, context) => {
  try {
    if (!isOid(userId)) throw new Error('Invalid userId format');
    const targetId = oid(userId);

    // who is viewing?
    const viewerIdStr =
      context?.user?._id?.toString?.() ||
      context?.user?.id ||
      context?.user?.userId ||
      null;

    const viewerId =
      viewerIdStr && isOid(viewerIdStr) ? oid(viewerIdStr) : null;

    // determine privacy scope
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

    // optional type filter
    const typeFilter =
      Array.isArray(types) && types.length ? { type: { $in: types } } : {};

    // base filter (allow legacy docs missing privacy/visibility)
    const base = {
      ownerId: targetId,
      ...typeFilter,
      $and: [
        {
          $or: [
            { visibility: { $in: ['visible'] } },
            { visibility: { $exists: false } },
          ],
        },
        {
          $or: [
            { privacy: { $in: allowedPrivacy } },
            { privacy: { $exists: false } }, // treat missing as public
          ],
        },
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

    // enrich media
    const enriched = await Promise.all(
      visible.map(async (p) => ({
        ...p,
        media: await resolveTaggedPhotoUsers(p.media || []),
      }))
    );

    return enriched;
  } catch (error) {
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = { getUserPosts };
