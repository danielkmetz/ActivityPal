// hydratePostsForResponse.js
const { Post } = require('../../models/Post'); // unified model
const Promotion = require('../../models/Promotions');
const Event = require('../../models/Events');
const LiveStream = require('../../models/LiveStream');
const { enrichOneOrMany } = require('../enrichPosts'); // helper from above
const { getPresignedUrl } = require('../cachePresignedUrl');
const { filterHiddenPosts } = require('./filterHiddenPosts');

/**
 * Normalize liveStream posts so `details` always has a consistent shape.
 * Optionally signs `coverKey` -> `coverUrl`.
 */
async function normalizeLiveStreamDetails(post, liveDoc = null) {
  if (!post || post.type !== 'liveStream') return post;

  const d = post.details || {};
  const src = liveDoc || {};

  const result = {
    title: d.title || src.title || '',
    status: d.status || src.status || 'idle',
    coverKey: d.coverKey || src.coverKey || null,

    durationSec:
      typeof d.durationSec === 'number'
        ? d.durationSec
        : typeof src.durationSec === 'number'
        ? src.durationSec
        : 0,

    viewerPeak:
      d.viewerPeak ??
      (src.stats ? src.stats.viewerPeak : undefined) ??
      0,

    startedAt: d.startedAt || src.startedAt || null,
    endedAt: d.endedAt || src.endedAt || null,

    playbackUrl: d.playbackUrl || src.playbackUrl || null,
    vodUrl:
      d.vodUrl ||
      (src.recording ? src.recording.vodUrl : null) ||
      null,

    __typename: 'LiveStreamDetails',
  };

  if (result.coverKey) {
    try {
      result.coverUrl = d.coverUrl || (await getPresignedUrl(result.coverKey));
    } catch (e) {
      console.error('[normalizeLiveStreamDetails] Failed to sign coverKey', {
        coverKey: result.coverKey,
        error: e?.message,
      });
      result.coverUrl = d.coverUrl || null;
    }
  } else {
    result.coverUrl = d.coverUrl || null;
  }

  if (!post.placeId && src.placeId) {
    post.placeId = src.placeId;
  }
  if (!post.message && src.caption) {
    post.message = src.caption;
  }

  post.details = result;
  return post;
}

/**
 * Figure out which LiveStream ID a post refers to.
 */
function getLiveStreamRefId(post) {
  if (!post) return null;
  if (post.refs && post.refs.liveStreamId) return String(post.refs.liveStreamId);
  if (post.liveStreamId) return String(post.liveStreamId); // legacy
  if (post.details && post.details.liveStreamId)
    return String(post.details.liveStreamId);
  return null;
}

/**
 * Try to load a LiveStream doc for a given post.
 */
async function loadLiveStreamForPost(post) {
  if (!post || post.type !== 'liveStream') return null;

  const refId = getLiveStreamRefId(post);
  let live = null;

  if (refId) {
    try {
      live = await LiveStream.findById(refId).lean();
    } catch (e) {
      console.error('[loadLiveStreamForPost] Failed to find by refId', {
        refId,
        error: e?.message,
      });
    }
  }

  if (!live && post._id) {
    try {
      live = await LiveStream.findOne({ sharedPostId: post._id }).lean();
    } catch (e) {
      console.error('[loadLiveStreamForPost] Failed to find by sharedPostId', {
        postId: post._id,
        error: e?.message,
      });
    }
  }

  return live;
}

/**
 * Build a map of LiveStream docs keyed by ID, for all liveStream posts we see.
 */
async function buildLiveStreamMapForPosts(posts) {
  const ids = new Set();

  for (const p of posts || []) {
    if (!p) continue;

    if (p.type === 'liveStream') {
      const refId = getLiveStreamRefId(p);
      if (refId) ids.add(refId);
    }

    if (p.original && p.original.type === 'liveStream') {
      const refId = getLiveStreamRefId(p.original);
      if (refId) ids.add(refId);
    }

    if (p.shared?.snapshot && p.shared.snapshot.type === 'liveStream') {
      const refId = getLiveStreamRefId(p.shared.snapshot);
      if (refId) ids.add(refId);
    }
  }

  const idList = [...ids];
  if (!idList.length) return new Map();

  const lives = await LiveStream.find({ _id: { $in: idList } }).lean();
  const map = new Map();
  for (const live of lives) {
    map.set(String(live._id), live);
  }
  return map;
}

/**
 * Try to load an "original" document by id from Post, Promotion, or Event.
 */
async function loadOriginalById(id, originalMap) {
  if (!id) return null;
  const key = String(id);

  if (originalMap && originalMap instanceof Map) {
    return originalMap.get(key) || null;
  }

  let original = await Post.findById(key).lean();
  if (original) return original;

  const promo = await Promotion.findById(key).lean();
  if (promo) {
    return {
      ...promo,
      type: promo.type || 'promotion',
      canonicalType: promo.canonicalType || 'promotion',
      kind: promo.kind || 'promotion',
    };
  }

  const ev = await Event.findById(key).lean();
  if (ev) {
    return {
      ...ev,
      type: ev.type || 'event',
      canonicalType: ev.canonicalType || 'event',
      kind: ev.kind || 'event',
    };
  }

  return null;
}

/**
 * Build a map of originals (Post + Promotion + Event) for a set of IDs.
 */
async function buildOriginalMapForIds(ids) {
  const uniqIds = [...new Set((ids || []).map(String))];
  const originalMap = new Map();
  if (!uniqIds.length) return originalMap;

  const postOriginals = await Post.find({ _id: { $in: uniqIds } }).lean();
  for (const o of postOriginals) {
    originalMap.set(String(o._id), o);
  }

  const promoOriginals = await Promotion.find({ _id: { $in: uniqIds } }).lean();
  for (const o of promoOriginals) {
    originalMap.set(String(o._id), {
      ...o,
      type: o.type || 'promotion',
      canonicalType: o.canonicalType || 'promotion',
      kind: o.kind || 'promotion',
    });
  }

  const eventOriginals = await Event.find({ _id: { $in: uniqIds } }).lean();
  for (const o of eventOriginals) {
    originalMap.set(String(o._id), {
      ...o,
      type: o.type || 'event',
      canonicalType: o.canonicalType || 'event',
      kind: o.kind || 'event',
    });
  }

  return originalMap;
}

/* ------------------------------------------------------------------ */
/* Promo / Event helpers                                              */
/* ------------------------------------------------------------------ */

function isPromoOrEventDoc(doc) {
  if (!doc) return false;
  const t = String(
    doc.canonicalType || doc.kind || doc.type || ''
  ).toLowerCase();
  return t === 'promotion' || t === 'event';
}

/**
 * Build EventDetails / PromotionDetails from the enriched promo/event doc.
 * Assumes businessAddress has already been injected via enrichPosts.
 */
function hydratePromoOrEventDetails(doc) {
  if (!doc || !isPromoOrEventDoc(doc)) return doc;

  const businessAddress = doc.businessAddress || null;

  // If details already exist with time info, don't overwrite those,
  // but DO backfill address if coming from Business.
  if (doc.details && (doc.details.startsAt || doc.details.startTime)) {
    if (businessAddress && !doc.details.address) {
      doc.details = {
        ...doc.details,
        address: businessAddress,
      };
    }
    return doc;
  }

  const canonical = String(
    doc.canonicalType || doc.kind || doc.type || ''
  ).toLowerCase();

  const description = doc.description ?? doc.details?.description ?? null;

  const recurring =
    typeof doc.recurring === 'boolean'
      ? doc.recurring
      : doc.details?.recurring ?? false;

  const recurringDays = Array.isArray(doc.recurringDays)
    ? doc.recurringDays
    : doc.details?.recurringDays || [];

  const start = doc.startTime ?? doc.startsAt ?? doc.details?.startsAt ?? null;
  const end = doc.endTime ?? doc.endsAt ?? doc.details?.endsAt ?? null;

  const title = doc.title ?? doc.details?.title ?? null;

  const allDay =
    typeof doc.allDay === 'boolean'
      ? doc.allDay
      : typeof doc.details?.allDay === 'boolean'
      ? doc.details.allDay
      : false;

  const common = {
    description,
    recurring,
    recurringDays,
    startsAt: start,
    endsAt: end,
    startTime: start,
    endTime: end,
    title,
    allDay,
    address: businessAddress,
  };

  if (canonical === 'event') {
    doc.details = {
      ...(doc.details || {}),
      __typename: 'EventDetails',
      ...common,
      hostId: doc.hostId ?? doc.details?.hostId ?? null,
    };
  } else if (canonical === 'promotion') {
    doc.details = {
      ...(doc.details || {}),
      __typename: 'PromotionDetails',
      ...common,
      discountPct: doc.discountPct ?? doc.details?.discountPct ?? null,
      code: doc.code ?? doc.details?.code ?? null,
    };
  }

  return doc;
}

/**
 * Normalize shared promo/event to a "suggestion" wrapper while preserving canonicalType.
 */
function normalizeSharedSuggestion(post) {
  if (!post || post.type !== 'sharedPost') return post;

  if (post.original && isPromoOrEventDoc(post.original)) {
    const canonical = String(
      post.original.canonicalType ||
        post.original.kind ||
        post.original.type ||
        ''
    ).toLowerCase();

    post.original = {
      ...post.original,
      type: 'suggestion',
      canonicalType: canonical || 'suggestion',
      kind: post.original.kind || canonical || 'suggestion',
    };
  }

  if (post.shared?.snapshot && isPromoOrEventDoc(post.shared.snapshot)) {
    const snapCanonical = String(
      post.shared.snapshot.canonicalType ||
        post.shared.snapshot.kind ||
        post.shared.snapshot.type ||
        ''
    ).toLowerCase();

    post.shared = {
      ...(post.shared || {}),
      snapshot: {
        ...post.shared.snapshot,
        type: 'suggestion',
        canonicalType: snapCanonical || 'suggestion',
        kind: post.shared.snapshot.kind || snapCanonical || 'suggestion',
      },
    };
  }

  return post;
}

/**
 * Apply promo/event hydration + suggestion normalization to shared posts.
 */
function applySharedPromoEventHydration(post) {
  if (!post || post.type !== 'sharedPost') return post;

  if (post.original && isPromoOrEventDoc(post.original)) {
    hydratePromoOrEventDetails(post.original);
  }
  if (post.shared?.snapshot && isPromoOrEventDoc(post.shared.snapshot)) {
    hydratePromoOrEventDetails(post.shared.snapshot);
  }

  normalizeSharedSuggestion(post);
  return post;
}

/* ------------------------------------------------------------------ */
/* Main hydration entry points                                        */
/* ------------------------------------------------------------------ */

/**
 * Hydrate + enrich ONE post for response.
 */
async function hydratePostForResponse(raw, opts = {}) {
  const {
    viewerId = null, // currently unused
    originalMap = null,
    attachBusinessNameIfMissing = null,
  } = opts;

  if (!raw) return raw;

  if (raw.type === 'sharedPost' && raw.shared?.originalPostId) {
    const id = String(raw.shared.originalPostId);
    const original = await loadOriginalById(id, originalMap);
    if (original) {
      raw.original = original;
    }
  }

  const items = [raw];
  const hasSnapshot = !!raw?.shared?.snapshot;
  const hasOriginal = !!raw?.original;

  if (hasSnapshot) items.push(raw.shared.snapshot);
  if (hasOriginal) items.push(raw.original);

  const enrichedItems = await enrichOneOrMany(items);

  let idx = 0;
  const enriched = enrichedItems[idx++];

  if (hasSnapshot) {
    enriched.shared = {
      ...(enriched.shared || raw.shared || {}),
      snapshot: enrichedItems[idx++],
    };
  }

  if (hasOriginal) {
    enriched.original = enrichedItems[idx++];
  }

  if (attachBusinessNameIfMissing) {
    await attachBusinessNameIfMissing(enriched);
    if (enriched.original) {
      await attachBusinessNameIfMissing(enriched.original);
    }
    if (enriched.shared?.snapshot) {
      await attachBusinessNameIfMissing(enriched.shared.snapshot);
    }
  }

  if (enriched.type === 'liveStream') {
    const liveDoc = await loadLiveStreamForPost(enriched);
    await normalizeLiveStreamDetails(enriched, liveDoc);
  }

  if (enriched.original && enriched.original.type === 'liveStream') {
    const liveDoc = await loadLiveStreamForPost(enriched.original);
    await normalizeLiveStreamDetails(enriched.original, liveDoc);
  }

  if (enriched.shared?.snapshot && enriched.shared.snapshot.type === 'liveStream') {
    await normalizeLiveStreamDetails(enriched.shared.snapshot, null);
  }

  // 🔹 hydrate promo/event originals & snapshots as suggestions with details
  applySharedPromoEventHydration(enriched);

  return enriched;
}

/**
 * Hydrate + enrich MANY posts for response (batch-optimized).
 */
async function hydrateManyPostsForResponse(posts, opts = {}) {
  const { viewerId = null, attachBusinessNameIfMissing = null } = opts;

  posts = await filterHiddenPosts(posts, viewerId, {
    debugTag: '[hydrateManyPostsForResponse]',
  });

  if (!Array.isArray(posts) || posts.length === 0) return [];

  const originalIds = posts
    .filter((p) => p?.type === 'sharedPost' && p?.shared?.originalPostId)
    .map((p) => String(p.shared.originalPostId));

  const originalMap = await buildOriginalMapForIds(originalIds);

  const flat = [];
  const structure = [];

  for (const p of posts) {
    if (p.type === 'sharedPost' && p?.shared?.originalPostId) {
      const o = originalMap.get(String(p.shared.originalPostId));
      if (o) {
        p.original = o;
      }
    }

    const hasSnapshot = !!p?.shared?.snapshot;
    const hasOriginal = !!p?.original;

    structure.push({ hasSnapshot, hasOriginal });
    flat.push(p);
    if (hasSnapshot) flat.push(p.shared.snapshot);
    if (hasOriginal) flat.push(p.original);
  }

  const enrichedFlat = await enrichOneOrMany(flat);
  const liveStreamMap = await buildLiveStreamMapForPosts(
    enrichedFlat.filter(Boolean)
  );

  let idx = 0;
  const out = [];

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const { hasSnapshot, hasOriginal } = structure[i];
    const top = enrichedFlat[idx++];

    if (hasSnapshot) {
      top.shared = {
        ...(top.shared || p.shared || {}),
        snapshot: enrichedFlat[idx++],
      };
    }
    if (hasOriginal) {
      top.original = enrichedFlat[idx++];
    }

    if (attachBusinessNameIfMissing) {
      await attachBusinessNameIfMissing(top);
      if (top.original) {
        await attachBusinessNameIfMissing(top.original);
      }
      if (top.shared?.snapshot) {
        await attachBusinessNameIfMissing(top.shared.snapshot);
      }
    }

    if (top.type === 'liveStream') {
      const refId = getLiveStreamRefId(top);
      const liveDoc = refId ? liveStreamMap.get(refId) : null;
      await normalizeLiveStreamDetails(top, liveDoc || null);
    }

    if (top.original && top.original.type === 'liveStream') {
      const refId = getLiveStreamRefId(top.original);
      const liveDoc = refId ? liveStreamMap.get(refId) : null;
      await normalizeLiveStreamDetails(top.original, liveDoc || null);
    }

    if (top.shared?.snapshot && top.shared.snapshot.type === 'liveStream') {
      await normalizeLiveStreamDetails(top.shared.snapshot, null);
    }

    // 🔹 hydrate promo/event originals & snapshots as suggestions with details
    applySharedPromoEventHydration(top);

    out.push(top);
  }

  return out;
}

module.exports = {
  hydratePostForResponse,
  hydrateManyPostsForResponse,
};
