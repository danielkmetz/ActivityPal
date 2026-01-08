const { GraphQLError } = require('graphql');
const User = require('../../models/User');
const Business = require('../../models/Business');
const { Post } = require('../../models/Post');
const { getAuthorExclusionSets } = require('../../services/blockService');
const { hydrateManyPostsForResponse } = require('../../utils/posts/hydrateAndEnrichForResponse');
const { buildCursorQuery } = require('../../utils/posts/buildCursorQuery');
const { oid, isOid } = require('../../utils/posts/oid');
const { normalizeTypesArg } = require('../../utils/posts/normalizeTypesArg');

const DEFAULT_LIMIT = 5;
const VISIBLE_STATES = ['visible'];

const DEBUG = String(process.env.DEBUG_ACTIVITY_FEED || '').toLowerCase() === 'true';

function safeId(v) {
  if (!v) return null;
  const s = String(v);
  return s.length <= 8 ? s : `…${s.slice(-8)}`;
}

function safeStr(v, max = 80) {
  if (v == null) return null;
  const s = String(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function countBy(arr, keyFn) {
  const out = {};
  (Array.isArray(arr) ? arr : []).forEach((x) => {
    const k = keyFn(x);
    out[k] = (out[k] || 0) + 1;
  });
  return out;
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
  const t0 = Date.now();

  const reqId =
    context?.req?.headers?.['x-request-id'] ||
    context?.req?.id ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const meId =
    context?.user?._id?.toString?.() ||
    context?.user?.id ||
    context?.user?.userId;

  const log = (label, obj) => {
    if (!DEBUG) return;
    console.log(`[getUserActivity][${reqId}] ${label}`, obj || {});
  };

  log('start', {
    meId: safeId(meId),
    typesArg: Array.isArray(types) ? types.map((t) => safeStr(t, 32)) : safeStr(types, 64),
    limitArg: limit,
    afterPresent: !!after,
    afterPreview: after ? safeStr(JSON.stringify(after), 120) : null,
  });

  if (!meId || !isOid(meId)) {
    throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
  }

  const me = await User.findById(oid(meId)).select('following').lean();
  if (!me) {
    throw new GraphQLError('User not found', { extensions: { code: 'BAD_USER_INPUT' } });
  }

  const followingStr = (me.following || []).map(String);

  let rawExclude = [];
  try {
    const ex = await getAuthorExclusionSets(meId);
    rawExclude = ex?.excludeAuthorIds || [];
  } catch (e) {
    rawExclude = [];
    log('exclusion_sets_error', { message: e?.message });
  }

  const excludeSet = new Set((rawExclude || []).map(String));

  const authorOids = [meId, ...followingStr]
    .filter((id) => !excludeSet.has(String(id)))
    .map(oid);

  if (!authorOids.length) return [];

  const typeFilter = normalizeTypesArg(types);
  if (Array.isArray(typeFilter) && typeFilter.length === 0) return [];

  const requested = Math.min(Number(limit) || DEFAULT_LIMIT, 100);

  const baseCommon = {
    ...(Array.isArray(typeFilter) && typeFilter.length ? { type: { $in: typeFilter } } : {}),
    visibility: { $in: VISIBLE_STATES },
    ...buildPrivacyAuthorFilter(meId, authorOids),
  };

  // ✅ Fill-to-limit without skip():
  // Page through the raw posts with an internal cursor, hydrate/filter each chunk,
  // accumulate until we have `requested` or we truly exhaust candidates.
  const CHUNK = Math.min(Math.max(requested * 4, 20), 100);
  const MAX_PASSES = 10;

  let passes = 0;
  let cursor = after && typeof after === 'object' ? { ...after } : null;

  const collected = [];
  const seen = new Set(); // safety dedupe

  while (collected.length < requested && passes < MAX_PASSES) {
    passes += 1;

    const query = {
      ...baseCommon,
      ...buildCursorQuery(cursor),
    };

    const qStart = Date.now();
    const raw = await Post.find(query)
      .sort({ sortDate: -1, _id: -1 })
      .limit(CHUNK)
      .lean();
    const qMs = Date.now() - qStart;

    log('pass_raw', {
      pass: passes,
      cursor: cursor
        ? { sortDate: cursor.sortDate, id: safeId(cursor.id || cursor._id) }
        : null,
      chunk: CHUNK,
      ms: qMs,
      rawLen: raw.length,
      rawByType: countBy(raw, (p) => String(p?.type || 'unknown')),
      rawFirst: raw[0] ? { id: safeId(raw[0]._id), type: raw[0].type, sortDate: raw[0].sortDate } : null,
      rawLast: raw[raw.length - 1]
        ? {
          id: safeId(raw[raw.length - 1]._id),
          type: raw[raw.length - 1].type,
          sortDate: raw[raw.length - 1].sortDate,
        }
        : null,
    });

    if (!raw.length) break;

    const hStart = Date.now();
    const enriched = await hydrateManyPostsForResponse(raw, {
      viewerId: meId,
      attachBusinessNameIfMissing,
      applyInviteFeedFilter: true,
    });
    const hMs = Date.now() - hStart;

    const arr = Array.isArray(enriched) ? enriched.filter(Boolean) : [];

    log('pass_hydrated', {
      pass: passes,
      ms: hMs,
      enrichedLen: arr.length,
      enrichedByType: countBy(arr, (p) => String(p?.type || 'unknown')),
    });

    for (const p of arr) {
      const id = p?._id ? String(p._id) : null;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      collected.push(p);
      if (collected.length >= requested) break;
    }

    // Advance internal cursor using the *raw* tail (not enriched),
    // because raw is the true ordered stream.
    const tail = raw[raw.length - 1];
    if (!tail?.sortDate || !tail?._id) {
      // If sortDate is missing, cursor paging can't be trusted; stop safely.
      log('cursor_stop_missing_tail', { tailId: safeId(tail?._id), tailSortDate: tail?.sortDate || null });
      break;
    }

    cursor = { sortDate: tail.sortDate, id: String(tail._id) };

    // If DB returned fewer than CHUNK, stream is exhausted for this cursor.
    if (raw.length < CHUNK) break;
  }

  log('final', {
    requested,
    returned: collected.length,
    passes,
    totalMs: Date.now() - t0,
  });

  return collected.slice(0, requested);
};

module.exports = { getUserActivity };
