const { Post } = require('../../models/Post'); // unified model
const Promotion = require('../../models/Promotions');
const Event = require('../../models/Events');
const LiveStream = require('../../models/LiveStream');
const { enrichOneOrMany } = require('../enrichPosts'); // helper from above
const { filterHiddenPosts } = require('./filterHiddenPosts');

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

  const enrichedItems = await enrichOneOrMany(items, viewerId);

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

  const enrichedFlat = await enrichOneOrMany(flat, viewerId);
  
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
