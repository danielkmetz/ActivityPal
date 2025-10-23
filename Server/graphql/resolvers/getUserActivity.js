const mongoose = require('mongoose');
const { GraphQLError } = require('graphql');
const { getUserAndFollowingReviews } = require('./getUserAndFollowingReviews');
const { getUserAndFollowingCheckIns } = require('./getUserAndFollowingCheckIns');
const { getUserAndFollowingInvites } = require('./getUserAndFollowingInvites');
const { getUserAndFollowingSharedPosts } = require('./userAndFollowingSharedPosts');
const { getPostedLiveStreams } = require('./getPostedLiveStreams');
const { normalizePostType: normalizeRawType } = require('../../utils/normalizePostType');
const HiddenPost = require('../../models/HiddenPosts');
const { getAuthorExclusionSets } = require('../../services/blockService'); // ensure this import exists

const DEBUG = process.env.DEBUG_USER_ACTIVITY === '1';

const REF_TO_RAW = {
  Review: 'review',
  CheckIn: 'check-in',
  SharedPost: 'sharedPost',
  ActivityInvite: 'invite',
  Event: 'event',
  Promotion: 'promotion',
};

const getAuthUserId = (ctx) =>
  ctx?.user?._id?.toString?.() || ctx?.user?.id || ctx?.user?.userId || null;

function makeLogger(scope) {
  const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();
  const log = (...args) => { if (DEBUG) console.log(`[${scope}] [${rid}]`, ...args); };
  const warn = (...args) => console.warn(`[${scope}] [${rid}]`, ...args);
  const err = (...args) => console.error(`[${scope}] [${rid}]`, ...args);
  const since = (label, tStart) => { if (DEBUG) log(`${label} took ${Date.now() - tStart}ms`); };
  const done = () => { if (DEBUG) log(`done in ${Date.now() - t0}ms`); };
  return { rid, log, warn, err, since, done };
}

const getUserActivity = async (_, { limit = 15, after, userLat, userLng }, context) => {
  const { log, warn, err, since, done } = makeLogger('getUserActivity');

  try {
    const authUserId = getAuthUserId(context);
    if (!authUserId) {
      throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
    }
    if (!mongoose.Types.ObjectId.isValid(authUserId)) {
      throw new GraphQLError('Invalid user id', { extensions: { code: 'BAD_USER_INPUT' } });
    }
    log('start', { authUserId, limit, hasAfter: !!after, userLat, userLng });

    // 0) Block sets
    let excludeAuthorIdsArr = [];
    let excludeAuthorIdsSet = new Set();
    try {
      const t = Date.now();
      const blockRes = await getAuthorExclusionSets(authUserId);
      excludeAuthorIdsArr = (blockRes?.excludeAuthorIds || []).map(String);
      excludeAuthorIdsSet = new Set(excludeAuthorIdsArr);
      since(`getAuthorExclusionSets (count=${excludeAuthorIdsArr.length})`, t);
    } catch (e) {
      warn('block sets fetch failed:', e?.message);
    }
    const excludeAuthorOids = excludeAuthorIdsArr.map((id) => new mongoose.Types.ObjectId(id));

    // 1) Hidden keys
    let hiddenKeySet = new Set();
    try {
      const t = Date.now();
      const hiddenRows = await HiddenPost.find(
        { userId: new mongoose.Types.ObjectId(String(authUserId)) },
        { targetRef: 1, targetId: 1, _id: 0 }
      ).lean();

      hiddenKeySet = new Set(
        (hiddenRows || []).map((r) => {
          const raw = REF_TO_RAW[r.targetRef] || String(r.targetRef || '').toLowerCase();
          return `${String(raw).toLowerCase()}:${String(r.targetId)}`;
        })
      );
      since(`hidden fetch (rows=${hiddenRows?.length || 0})`, t);
    } catch (e) {
      warn('hidden fetch failed:', e?.message);
    }

    // 2) Fetch source lists (timed & guarded)
    let reviews = [], checkIns = [], sharedPosts = [], liveStreams = [];
    let inviteData = { userInvites: [], friendPublicInvites: [] };

    try {
      const t = Date.now();
      reviews = (await getUserAndFollowingReviews(_, { userId: authUserId, excludeAuthorIds: excludeAuthorOids }, context)) || [];
      since(`getUserAndFollowingReviews (n=${reviews.length})`, t);
    } catch (e) { err('reviews failed:', e?.message || e); }

    try {
      const t = Date.now();
      checkIns = (await getUserAndFollowingCheckIns(_, { userId: authUserId, excludeAuthorIds: excludeAuthorOids }, context)) || [];
      since(`getUserAndFollowingCheckIns (n=${checkIns.length})`, t);
    } catch (e) { err('check-ins failed:', e?.message || e); }

    try {
      const t = Date.now();
      inviteData = (await getUserAndFollowingInvites(_, { userId: authUserId, excludeAuthorIds: excludeAuthorOids }, context)) || {};
      since(
        `getUserAndFollowingInvites (user=${inviteData?.userInvites?.length || 0}, friend=${inviteData?.friendPublicInvites?.length || 0})`,
        t
      );
    } catch (e) { err('invites failed:', e?.message || e); }

    try {
      const t = Date.now();
      sharedPosts = (await getUserAndFollowingSharedPosts(_, { userId: authUserId, userLat, userLng, excludeAuthorIds: excludeAuthorOids }, context)) || [];
      since(`getUserAndFollowingSharedPosts (n=${sharedPosts.length})`, t);
    } catch (e) { err('shared posts failed:', e?.message || e); }

    try {
      const t = Date.now();
      liveStreams = (await getPostedLiveStreams(_, { userId: authUserId, excludeAuthorIds: excludeAuthorOids }, context)) || [];
      since(`getPostedLiveStreams (n=${liveStreams.length})`, t);
    } catch (e) { err('live streams failed:', e?.message || e); }

    const invites = [
      ...(inviteData.userInvites || []),
      ...(inviteData.friendPublicInvites || []),
    ];

    const normalizeDate = (item) => {
      const rawDate = item.date || item.createdAt || item.timestamp || item.dateTime || 0;
      const parsedDate = new Date(rawDate);
      return { ...item, sortDate: parsedDate.toISOString() };
    };

    // 3) Build merged list
    const posts = [
      ...reviews.map((r) => normalizeDate({ ...r, type: 'review' })),
      ...checkIns.map((c) => normalizeDate({ ...c, type: 'check-in' })),
      ...invites.map((i) => normalizeDate({ ...i, type: 'invite' })),
      ...sharedPosts.map((s) => normalizeDate({ ...s, type: 'sharedPost' })),
      ...liveStreams.map((s) => normalizeDate({ ...s, type: 'liveStream' })),
    ];
    log('merged counts', {
      reviews: reviews.length,
      checkIns: checkIns.length,
      invites: invites.length,
      sharedPosts: sharedPosts.length,
      liveStreams: liveStreams.length,
      total: posts.length,
      excludeAuthorIds: excludeAuthorIdsArr.length,
      hiddenKeys: hiddenKeySet.size,
    });

    // 4) Exclude hidden
    const visible = posts.filter((p) => {
      const t = normalizeRawType(p.__typename || p.type);
      const id = String(p._id || p.id || '');
      if (!id) return true;
      return !hiddenKeySet.has(`${t}:${id}`);
    });
    log('after hidden filter', { before: posts.length, after: visible.length });

    // 5) Sort newest-first
    let filtered = visible.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

    // 6) Cursor
    if (after?.sortDate && after?.id) {
      const afterTime = new Date(after.sortDate).getTime();
      filtered = filtered.filter((p) => {
        const currentTime = new Date(p.sortDate).getTime();
        return currentTime < afterTime || (currentTime === afterTime && String(p._id || p.id) < String(after.id));
      });
      log('after cursor filter', { afterTime, remaining: filtered.length });
    }

    // 7) Limit
    const out = filtered.slice(0, limit);
    log('final', { limit, returned: out.length });
    done();
    return out;

  } catch (error) {
    err('UNCAUGHT:', error?.message, error?.stack);
    // Keep the outward message the same, but now we have rich logs above
    throw new Error('Failed to fetch user activity');
  }
};

module.exports = { getUserActivity };
