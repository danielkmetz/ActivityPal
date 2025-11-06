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
  const TAG = '[getUserPosts]';
  const t = (label) => `${TAG} ${label}`;
  const log = (...args) => console.log(TAG, ...args);

  try {
    console.time(t('total'));
    log('args:', { userId, types, limit, after });

    if (!isOid(userId)) {
      log('❌ invalid userId format:', userId);
      throw new Error('Invalid userId format');
    }
    const targetId = oid(userId);
    log('targetId (ObjectId):', String(targetId));

    // who is viewing?
    const viewerIdStr =
      context?.user?._id?.toString?.() ||
      context?.user?.id ||
      context?.user?.userId ||
      null;

    const viewerId =
      viewerIdStr && isOid(viewerIdStr) ? oid(viewerIdStr) : null;

    log('viewer:', {
      raw: viewerIdStr,
      valid: !!viewerId,
      viewerId: viewerId ? String(viewerId) : null,
    });

    // determine privacy scope
    let allowedPrivacy = ['public'];
    if (viewerId && viewerId.equals(targetId)) {
      allowedPrivacy = ['public', 'followers', 'private', 'unlisted'];
      log('privacy scope: SELF →', allowedPrivacy);
    } else if (viewerId) {
      const viewer = await User.findById(viewerId).select('following').lean();
      const followsTarget = !!(viewer?.following || []).some(
        (id) => String(id) === String(targetId)
      );
      allowedPrivacy = followsTarget ? ['public', 'followers'] : ['public'];
      log('privacy scope: VIEWER', {
        followsTarget,
        allowedPrivacy,
      });
    } else {
      log('privacy scope: ANON/NO-VIEWER →', allowedPrivacy);
    }

    // hidden posts for this viewer
    let hiddenIds = new Set();
    if (viewerId) {
      const rows = await HiddenPost.find(
        { userId: viewerId, targetRef: 'Post' },
        { targetId: 1, _id: 0 }
      ).lean();
      hiddenIds = new Set(rows.map((r) => String(r.targetId)));
      log('hidden rows:', rows.length);
    } else {
      log('hidden rows: skipped (no viewer)');
    }

    // optional type filter
    const typeFilter =
      Array.isArray(types) && types.length ? { type: { $in: types } } : {};
    log('typeFilter:', typeFilter);

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

    // For readability in logs
    const printableBase = {
      ...base,
      ownerId: String(base.ownerId),
    };
    log('query base:', JSON.stringify(printableBase));

    // DEBUG: quick counts to diagnose mismatches
    const c_owner_only = await Post.countDocuments({ ownerId: targetId });
    log('debug counts:', { byOwnerOnly: c_owner_only });

    console.time(t('db.find'));
    const items = await Post.find(base)
      .sort({ sortDate: -1, _id: -1 })
      .limit(Math.min(Number(limit) || 15, 100))
      .lean();
    console.timeEnd(t('db.find'));

    log('db results:', {
      total: items.length,
      sampleIds: items.slice(0, 5).map((p) => String(p._id)),
      sampleOwnerIds: items.slice(0, 5).map((p) => String(p.ownerId)),
    });

    // apply hidden filter
    const visible = items.filter((p) => !hiddenIds.has(String(p._id)));
    log('after hidden filter:', {
      kept: visible.length,
      removed: items.length - visible.length,
    });

    // If nothing returned, add extra diagnostics
    if (visible.length === 0) {
      const c_owner_priv_anyVis = await Post.countDocuments({
        ownerId: targetId,
        $or: [{ privacy: { $exists: false } }, { privacy: { $in: allowedPrivacy } }],
      });
      const c_owner_vis_anyPriv = await Post.countDocuments({
        ownerId: targetId,
        $or: [{ visibility: { $exists: false } }, { visibility: { $in: ['visible'] } }],
      });
      log('debug counts (owner with relaxed filters):', {
        owner_priv_ok_anyVis: c_owner_priv_anyVis,
        owner_vis_ok_anyPriv: c_owner_vis_anyPriv,
      });
    }

    // enrich media
    console.time(t('enrich'));
    const enriched = await Promise.all(
      visible.map(async (p) => ({
        ...p,
        media: await resolveTaggedPhotoUsers(p.media || []),
      }))
    );
    console.timeEnd(t('enrich'));

    log('returning:', {
      count: enriched.length,
      sample: enriched.slice(0, 3).map((p) => ({
        id: String(p._id),
        ownerId: String(p.ownerId),
        type: p.type,
        privacy: p.privacy,
        visibility: p.visibility,
      })),
    });

    console.timeEnd(t('total'));
    return enriched;
  } catch (error) {
    console.error(`${TAG} ❌ Error:`, error?.message, error?.stack);
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = { getUserPosts };
