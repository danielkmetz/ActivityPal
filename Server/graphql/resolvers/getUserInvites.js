const mongoose = require('mongoose');
const User = require('../../models/User');
const Business = require('../../models/Business');
const { Post } = require('../../models/Post');
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse');

const TAG = '[getUserInvites]';
const dlog = (...args) => {
  if ('2' === '1') {
    console.log(TAG, ...args);
  }
};

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));

const VISIBLE_STATES = ['visible'];

function buildCursorQuery(after) {
  if (!after?.sortDate || !after?.id || !isOid(after.id)) {
    dlog('buildCursorQuery: no valid cursor, returning empty filter', { after });
    return {};
  }

  const sd = new Date(after.sortDate);
  const cursor = {
    $or: [
      { sortDate: { $lt: sd } },
      { sortDate: sd, _id: { $lt: oid(after.id) } },
    ],
  };

  dlog('buildCursorQuery: built cursor filter', {
    sortDate: sd.toISOString(),
    id: String(after.id),
  });

  return cursor;
}

// same helper as other resolvers
async function attachBusinessNameIfMissing(post) {
  if (!post || post.businessName || !post.placeId) return post;
  const biz = await Business.findOne({ placeId: post.placeId })
    .select('businessName')
    .lean();
  if (biz?.businessName) post.businessName = biz.businessName;
  return post;
}

/**
 * getUserInvites:
 * - returns ALL invite posts that involve the current viewer
 *   (as owner, recipient, or requestor)
 * - no "needsRecap" filtering; that’s purely a UI concern now
 */
const getUserInvites = async (_, { limit = 100, after }, context) => {
  const startedAt = Date.now();
  dlog('resolver called with args:', {
    limit,
    after,
    hasContextUser: !!context?.user,
  });

  try {
    const viewerIdStr =
      context?.user?._id?.toString?.() ||
      context?.user?.id ||
      context?.user?.userId ||
      null;

    dlog('resolved viewerIdStr:', viewerIdStr);

    if (!viewerIdStr || !isOid(viewerIdStr)) {
      dlog('Not authenticated or invalid viewerIdStr', { viewerIdStr });
      throw new Error('Not authenticated');
    }

    const viewerOid = oid(viewerIdStr);

    const cursorFilter = buildCursorQuery(after);

    // All invites where this user is:
    // - owner (sender)
    // - in details.recipients.userId
    // - in details.requests.userId
    const base = {
      type: 'invite',
      visibility: { $in: VISIBLE_STATES },
      $or: [
        { ownerId: viewerOid },
        { 'details.recipients.userId': viewerOid },
        { 'details.requests.userId': viewerOid },
      ],
      ...cursorFilter,
    };

    const finalLimit = Math.min(Number(limit) || 100, 200);

    dlog('Mongo query about to run', {
      viewerId: viewerIdStr,
      limit: finalLimit,
      baseFilter: {
        type: base.type,
        visibility: base.visibility,
        orCount: base.$or.length,
        hasCursor: !!Object.keys(cursorFilter || {}).length,
      },
      sort: { 'details.dateTime': -1, _id: -1 },
    });

    const items = await Post.find(base)
      .sort({ 'details.dateTime': -1, _id: -1 })
      .limit(finalLimit)
      .lean();

    dlog('Mongo query returned items', {
      count: items.length,
      first: items[0]
        ? {
            id: String(items[0]._id),
            type: items[0].type,
            sortDate: items[0].sortDate,
            detailsDateTime: items[0].details?.dateTime,
          }
        : null,
      last: items[items.length - 1]
        ? {
            id: String(items[items.length - 1]._id),
            type: items[items.length - 1].type,
            sortDate: items[items.length - 1].sortDate,
            detailsDateTime: items[items.length - 1].details?.dateTime,
          }
        : null,
    });

    if (!items.length) {
      dlog('No items found, returning empty array');
      return [];
    }

    const enriched = await hydrateManyPostsForResponse(items, {
      viewerId: viewerIdStr, // <- flows into enrichOneOrMany
      attachBusinessNameIfMissing,
    });

    dlog('hydrateManyPostsForResponse completed', {
      enrichedCount: enriched?.length || 0,
    });

    const elapsedMs = Date.now() - startedAt;
    dlog('resolver finished successfully', {
      totalReturned: enriched.length,
      elapsedMs,
    });

    return enriched;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    console.error(TAG, 'ERROR:', {
      message: error.message,
      stack: error.stack,
      elapsedMs,
    });
    throw new Error(`[Resolver Error] ${error.message}`);
  }
};

module.exports = { getUserInvites };
