const { Post } = require('../../models/Post'); // unified model
const { enrichOneOrMany } = require('../enrichPosts'); // your existing helper

/**
 * Hydrate + enrich ONE post for response.
 * - Optionally uses a pre-fetched originalMap to avoid N+1
 * - Optionally calls attachBusinessNameIfMissing on top/original/snapshot
 */
async function hydratePostForResponse(raw, opts = {}) {
  const {
    viewerId = null,
    originalMap = null,                     // Map<originalId, originalDoc>
    attachBusinessNameIfMissing = null,     // async (post) => post
  } = opts;

  if (!raw) return raw;

  // attach live original if sharedPost (response-only)
  let original = null;
  if (raw.type === 'sharedPost' && raw.shared?.originalPostId) {
    const id = String(raw.shared.originalPostId);
    original = originalMap ? originalMap.get(id) : await Post.findById(id).lean();
    if (original) raw.original = original;
  }

  // flatten: [top, snapshot?, original?] so enrichOneOrMany runs once
  const items = [raw];
  const hasSnapshot = !!raw?.shared?.snapshot;
  const hasOriginal = !!raw?.original;

  if (hasSnapshot) items.push(raw.shared.snapshot);
  if (hasOriginal) items.push(raw.original);

  const enrichedItems = await enrichOneOrMany(items);

  // reassemble
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

  // attach businessName where missing (optional)
  if (attachBusinessNameIfMissing) {
    await attachBusinessNameIfMissing(enriched);
    if (enriched.original) await attachBusinessNameIfMissing(enriched.original);
    if (enriched.shared?.snapshot) await attachBusinessNameIfMissing(enriched.shared.snapshot);
  }

  return enriched;
}

/**
 * Hydrate + enrich MANY posts for response (batch-optimized).
 * - Batches all originalPostId lookups (no N+1)
 * - Calls enrichOneOrMany ONCE over the flattened list
 */
async function hydrateManyPostsForResponse(posts, opts = {}) {
  const {
    viewerId = null,
    attachBusinessNameIfMissing = null, // async (post) => post
  } = opts;

  if (!Array.isArray(posts) || posts.length === 0) return [];

  // collect unique original ids and fetch originals in one go
  const originalIds = posts
    .filter(p => p?.type === 'sharedPost' && p?.shared?.originalPostId)
    .map(p => String(p.shared.originalPostId));
  const uniqOriginalIds = [...new Set(originalIds)];

  let originalMap = new Map();
  if (uniqOriginalIds.length) {
    const originals = await Post.find({ _id: { $in: uniqOriginalIds } }).lean();
    originalMap = new Map(originals.map(o => [String(o._id), o]));
  }

  // build a single flattened list in fixed order and keep the structure
  const flat = [];
  const structure = []; // [{ hasSnapshot, hasOriginal }]

  for (const p of posts) {
    // attach original for response if shared
    if (p.type === 'sharedPost' && p?.shared?.originalPostId) {
      const o = originalMap.get(String(p.shared.originalPostId));
      if (o) p.original = o;
    }

    const hasSnapshot = !!p?.shared?.snapshot;
    const hasOriginal = !!p?.original;

    structure.push({ hasSnapshot, hasOriginal });
    flat.push(p);
    if (hasSnapshot) flat.push(p.shared.snapshot);
    if (hasOriginal) flat.push(p.original);
  }

  // one enrichment pass builds userMap internally
  const enrichedFlat = await enrichOneOrMany(flat);

  // reassemble and run optional businessName attach
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
      if (top.original) await attachBusinessNameIfMissing(top.original);
      if (top.shared?.snapshot) await attachBusinessNameIfMissing(top.shared.snapshot);
    }

    out.push(top);
  }

  return out;
}

module.exports = {
  hydratePostForResponse,
  hydrateManyPostsForResponse,
};
