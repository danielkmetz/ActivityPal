const { Post } = require('../../models/Post'); // unified model
const Promotion = require('../../models/Promotions');
const Event = require('../../models/Events');
const LiveStream = require('../../models/LiveStream');
const { enrichOneOrMany } = require('../enrichPosts'); // your existing helper
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
        : (typeof src.durationSec === 'number' ? src.durationSec : 0),

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

  // coverUrl from coverKey, if present
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

  // Optional: backfill placeId/message from liveDoc if missing
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
 * Prefer refs.liveStreamId, but you can extend this if needed.
 */
function getLiveStreamRefId(post) {
  if (!post) return null;
  if (post.refs && post.refs.liveStreamId) return String(post.refs.liveStreamId);
  if (post.liveStreamId) return String(post.liveStreamId); // legacy fallback
  if (post.details && post.details.liveStreamId) return String(post.details.liveStreamId); // just in case
  return null;
}

/**
 * Try to load a LiveStream doc for a given post.
 * 1) by refs.liveStreamId
 * 2) fallback: by sharedPostId (if you ever use that linkage)
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
 * This is used in the batch hydrator.
 */
async function buildLiveStreamMapForPosts(posts) {
  const ids = new Set();

  for (const p of posts) {
    if (!p) continue;

    // top-level liveStream posts
    if (p.type === 'liveStream') {
      const refId = getLiveStreamRefId(p);
      if (refId) ids.add(refId);
    }

    // shared original that is a liveStream
    if (p.original && p.original.type === 'liveStream') {
      const refId = getLiveStreamRefId(p.original);
      if (refId) ids.add(refId);
    }

    // snapshot liveStream (less common, but handle it)
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
 * Optionally uses a pre-populated originalMap if provided.
 */
async function loadOriginalById(id, originalMap) {
  if (!id) return null;
  const key = String(id);

  // If we already have a map (batch case), just use it.
  if (originalMap && originalMap instanceof Map) {
    return originalMap.get(key) || null;
  }

  // Single-load case: try Post first, then Promotion, then Event.
  let original = await Post.findById(key).lean();
  if (original) return original;

  const promo = await Promotion.findById(key).lean();
  if (promo) {
    return {
      ...promo,
      // Ensure the downstream pipeline knows what this is
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
 * This is used in the batch hydrator to avoid N+1.
 */
async function buildOriginalMapForIds(ids) {
  const uniqIds = [...new Set((ids || []).map(String))];
  const originalMap = new Map();
  if (!uniqIds.length) return originalMap;

  // 1) Posts
  const postOriginals = await Post.find({ _id: { $in: uniqIds } }).lean();
  for (const o of postOriginals) {
    originalMap.set(String(o._id), o);
  }

  // 2) Promotions
  const promoOriginals = await Promotion.find({ _id: { $in: uniqIds } }).lean();
  for (const o of promoOriginals) {
    originalMap.set(String(o._id), {
      ...o,
      type: o.type || 'promotion',
      canonicalType: o.canonicalType || 'promotion',
      kind: o.kind || 'promotion',
    });
  }

  // 3) Events
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

/**
 * Hydrate + enrich ONE post for response.
 * - Supports sharedPost whose original lives in Post, Promotion, or Event.
 * - Optionally uses a pre-fetched originalMap to avoid extra DB hits.
 * - Optionally calls attachBusinessNameIfMissing on top/original/snapshot.
 */
async function hydratePostForResponse(raw, opts = {}) {
  const {
    viewerId = null, // currently unused, but kept for future
    originalMap = null, // Map<originalId, originalDoc>
    attachBusinessNameIfMissing = null, // async (post) => post
  } = opts;

  if (!raw) return raw;

  // Attach live original if sharedPost (response-only)
  if (raw.type === 'sharedPost' && raw.shared?.originalPostId) {
    const id = String(raw.shared.originalPostId);
    const original = await loadOriginalById(id, originalMap);
    if (original) {
      raw.original = original;
    }
  }

  // Flatten: [top, snapshot?, original?] so enrichOneOrMany runs once
  const items = [raw];
  const hasSnapshot = !!raw?.shared?.snapshot;
  const hasOriginal = !!raw?.original;

  if (hasSnapshot) items.push(raw.shared.snapshot);
  if (hasOriginal) items.push(raw.original);

  const enrichedItems = await enrichOneOrMany(items);

  // Reassemble
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

  // Optionally attach businessName where missing
  if (attachBusinessNameIfMissing) {
    await attachBusinessNameIfMissing(enriched);
    if (enriched.original) {
      await attachBusinessNameIfMissing(enriched.original);
    }
    if (enriched.shared?.snapshot) {
      await attachBusinessNameIfMissing(enriched.shared.snapshot);
    }
  }

  // 🔹 NEW: hydrate liveStream posts from the LiveStream doc
  if (enriched.type === 'liveStream') {
    const liveDoc = await loadLiveStreamForPost(enriched);
    await normalizeLiveStreamDetails(enriched, liveDoc);
  }

  if (enriched.original && enriched.original.type === 'liveStream') {
    const liveDoc = await loadLiveStreamForPost(enriched.original);
    await normalizeLiveStreamDetails(enriched.original, liveDoc);
  }

  if (enriched.shared?.snapshot && enriched.shared.snapshot.type === 'liveStream') {
    // snapshot usually already has details; just normalize it
    await normalizeLiveStreamDetails(enriched.shared.snapshot, null);
  }

  return enriched;
}

/**
 * Hydrate + enrich MANY posts for response (batch-optimized).
 * - Batches all originalPostId lookups across Post, Promotion, and Event.
 * - Batches LiveStream lookups for liveStream posts.
 * - Calls enrichOneOrMany ONCE over the flattened list.
 */
async function hydrateManyPostsForResponse(posts, opts = {}) {
  const {
    viewerId = null, // currently unused, but kept for future
    attachBusinessNameIfMissing = null, // async (post) => post
  } = opts;

   posts = await filterHiddenPosts(posts, viewerId, {
    debugTag: '[hydrateManyPostsForResponse]',
    // log: true, // turn on if you want debug logs
  });

  if (!Array.isArray(posts) || posts.length === 0) return [];

  // Collect unique original ids across all sharedPosts
  const originalIds = posts
    .filter((p) => p?.type === 'sharedPost' && p?.shared?.originalPostId)
    .map((p) => String(p.shared.originalPostId));

  const originalMap = await buildOriginalMapForIds(originalIds);

  // Attach originals for sharedPosts and track structure
  const flat = [];
  const structure = []; // [{ hasSnapshot, hasOriginal }]

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

  // One enrichment pass builds any user/business maps internally
  const enrichedFlat = await enrichOneOrMany(flat);

  // 🔹 Build a LiveStream map (by refs.liveStreamId, etc.)
  const liveStreamMap = await buildLiveStreamMapForPosts(
    // We want to look at the enriched versions, since refs may be there too
    enrichedFlat.filter(Boolean)
  );

  // Reassemble and run optional businessName attach + liveStream hydration
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

    // 🔹 normalize liveStream posts using the batch map
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

    out.push(top);
  }

  return out;
}

module.exports = {
  hydratePostForResponse,
  hydrateManyPostsForResponse,
};
