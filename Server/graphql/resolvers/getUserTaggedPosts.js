const mongoose = require('mongoose');
const User = require('../../models/User');
const HiddenPost = require('../../models/HiddenPosts');
const { Post } = require('../../models/Post');              // ✅ unified Post model
const { resolveTaggedPhotoUsers } = require('../../utils/userPosts');
const { getHiddenPostIdsForUser } = require('../../utils/hiddenTags'); // update your util to return Post ids

const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));
const oid   = (v) => new mongoose.Types.ObjectId(String(v));

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
 * filtered by viewer privacy and hidden settings.
 */
const getUserTaggedPosts = async (_, { userId, limit = 15, after }, context) => {
  try {
    if (!isOid(userId)) throw new Error('Invalid userId');

    const taggedUserId = oid(userId);                  // the profile we're viewing
    const viewerIdStr  = getAuthUserId(context);       // who is looking
    const viewerId     = viewerIdStr && isOid(viewerIdStr) ? oid(viewerIdStr) : null;

    // ensure target user exists (optional but nice)
    const exists = await User.exists({ _id: taggedUserId });
    if (!exists) throw new Error('User not found');

    // viewer privacy scope
    // self -> sees everything; follower -> public|followers; anon/other -> public only
    let allowedPrivacy = ['public'];
    let viewerFollowingOids = [];
    if (viewerId) {
      if (viewerId.equals(taggedUserId)) {
        allowedPrivacy = ['public', 'followers', 'private', 'unlisted'];
      } else {
        const viewer = await User.findById(viewerId).select('following').lean();
        viewerFollowingOids = (viewer?.following || []).map((id) => oid(id));
        if (viewerFollowingOids.length) {
          allowedPrivacy = ['public', 'followers'];
        }
      }
    }

    // posts this profile owner hid from their tagged tab
    const ownerHiddenIds = await getHiddenPostIdsForUser(taggedUserId); // -> [ObjectId|string]
    const ownerHiddenOidSet = new Set((ownerHiddenIds || []).map((x) => String(x)));

    // global hidden for the viewer (never show anywhere)
    let viewerHiddenIdSet = new Set();
    if (viewerId) {
      const rows = await HiddenPost.find(
        { userId: viewerId, targetRef: 'Post' },
        { targetId: 1, _id: 0 }
      ).lean();
      viewerHiddenIdSet = new Set(rows.map((r) => String(r.targetId)));
    }

    // build privacy filter
    const privacyOr = viewerId
      ? [
          { ownerId: viewerId },                          // viewer always sees their own posts
          { privacy: 'public' },
          ...(viewerFollowingOids.length
            ? [{ $and: [{ privacy: 'followers' }, { ownerId: { $in: viewerFollowingOids } }] }]
            : []),
        ]
      : [{ privacy: 'public' }];

    // query: posts by others where target user is tagged (post-level or media-level)
    const base = {
      ownerId: { $ne: taggedUserId },
      visibility: { $in: ['visible'] },
      $or: [
        { taggedUsers: taggedUserId },
        { 'media.taggedUsers.userId': taggedUserId },
      ],
      $and: [
        { $or: privacyOr },
      ],
      ...buildCursorQuery(after),
    };

    // fetch
    const items = await Post.find(base)
      .sort({ sortDate: -1, _id: -1 })
      .limit(Math.min(Number(limit) || 15, 100))
      .lean();

    // filter out hidden (owner-tagged-tab + viewer-global)
    const visible = items.filter((p) => {
      const id = String(p._id);
      if (ownerHiddenOidSet.has(id)) return false;
      if (viewerHiddenIdSet.has(id)) return false;
      return true;
    });

    // enrich media tags for the UI
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

module.exports = { getUserTaggedPosts };
