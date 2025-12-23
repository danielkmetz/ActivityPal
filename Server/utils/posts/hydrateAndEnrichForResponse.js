const { Post } = require('../../models/Post'); 
const Promotion = require('../../models/Promotions');
const Event = require('../../models/Events');
const { enrichOneOrMany } = require('../enrichPosts');
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
  for (const o of postOriginals) originalMap.set(String(o._id), o);

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
/* Invite filtering (NEW)                                             */
/* ------------------------------------------------------------------ */

function isInviteDoc(doc) {
  if (!doc) return false;
  const t = String(doc.type || doc.canonicalType || doc.kind || '').toLowerCase();
  return t === 'invite';
}

function parseDateSafe(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Decide what timestamp makes an invite "past".
 * Priority: endsAt/endTime -> startsAt/startTime -> date -> createdAt
 */
function getInviteEndDate(invite) {
  // Your schema guarantees details.dateTime for invites
  return parseDateSafe(invite?.details?.dateTime) || parseDateSafe(invite?.sortDate) || null;
}

function isPastInvite(invite, now = Date.now()) {
  const end = getInviteEndDate(invite);
  if (!end) return false;
  return end.getTime() < now;
}

/**
 * "Involved" = hosted OR went.
 * Hosted: invite.userId OR invite.hostId OR details.hostId matches viewerId.
 * Went: viewer is in details.recipients with an affirmative status.
 */
function isViewerInvolvedInInvite(invite, viewerId) {
  if (!invite || !viewerId) return false;
  const v = String(viewerId);

  // Host is the post owner for invites
  if (invite.ownerId && String(invite.ownerId) === v) return true;

  const recipients = Array.isArray(invite.details?.recipients) ? invite.details.recipients : [];
  const r = recipients.find((x) => x?.userId && String(x.userId) === v);
  if (r && String(r.status).toLowerCase() === 'accepted') return true;

  // If you allow “requests” to become accepted participation:
  const requests = Array.isArray(invite.details?.requests) ? invite.details.requests : [];
  const req = requests.find((x) => x?.userId && String(x.userId) === v);
  if (req && String(req.status).toLowerCase() === 'accepted') return true;

  return false;
}

function setNeedsRecapFlag(target, needsRecap) {
  if (!target) return;
  target.needsRecap = !!needsRecap;
  if (target.details && typeof target.details === 'object') {
    target.details = { ...target.details, needsRecap: !!needsRecap };
  }
}

/**
 * Find which inviteIds already have a recap by this viewer.
 * Assumption: recap posts store refs.relatedInviteId = inviteId
 * and are type/canonicalType in review/check-in variants.
 */
async function buildRecapInviteIdSet(inviteIds, viewerId) {
  const out = new Set();
  const ids = (inviteIds || []).map(String).filter(Boolean);
  if (!viewerId || ids.length === 0) return out;

  // Only recap-capable post types in your model
  const recapTypes = ['review', 'check-in'];

  // Fast: distinct uses your existing index:
  // BasePostSchema.index({ 'refs.relatedInviteId': 1, ownerId: 1, type: 1 });
  const raw = await Post.distinct('refs.relatedInviteId', {
    ownerId: viewerId,
    type: { $in: recapTypes },
    'refs.relatedInviteId': { $in: ids },
  });

  for (const rid of raw || []) out.add(String(rid));
  return out;
}

/**
 * Filter logic described by you.
 * - Past + not involved => drop
 * - Past + involved + recap done => drop
 * - Past + involved + recap NOT done => keep, mark needsRecap
 */
async function filterInvitesForViewer(posts, viewerId) {
  if (!Array.isArray(posts) || posts.length === 0) return [];
  const now = Date.now();

  // Collect candidate invite IDs that might need recap-checking (past + involved).
  const recapCheckIds = [];

  for (const p of posts) {
    const invite =
      isInviteDoc(p) ? p :
      (p?.type === 'sharedPost' && isInviteDoc(p?.original)) ? p.original :
      null;

    if (!invite) continue;
    if (!isPastInvite(invite, now)) continue;

    if (isViewerInvolvedInInvite(invite, viewerId)) {
      recapCheckIds.push(String(invite._id));
    }
  }

  const recapDoneSet = await buildRecapInviteIdSet(recapCheckIds, viewerId);

  const filtered = [];

  for (const p of posts) {
    const isDirectInvite = isInviteDoc(p);
    const isSharedInvite = p?.type === 'sharedPost' && isInviteDoc(p?.original);

    if (!isDirectInvite && !isSharedInvite) {
      filtered.push(p);
      continue;
    }

    const invite = isDirectInvite ? p : p.original;
    const past = isPastInvite(invite, now);

    if (!past) {
      // Future/current invites always keep
      filtered.push(p);
      continue;
    }

    const involved = isViewerInvolvedInInvite(invite, viewerId);

    if (!involved) {
      // Past + not involved => drop
      continue;
    }

    const recapDone = recapDoneSet.has(String(invite._id));

    if (recapDone) {
      // Past + involved + recap submitted => drop
      continue;
    }

    // Past + involved + recap NOT submitted => keep, mark needsRecap
    setNeedsRecapFlag(p, true);
    if (p?.original) setNeedsRecapFlag(p.original, true);
    if (p?.shared?.snapshot) setNeedsRecapFlag(p.shared.snapshot, true);

    filtered.push(p);
  }

  return filtered;
}

/* ------------------------------------------------------------------ */
/* Promo / Event helpers                                              */
/* ------------------------------------------------------------------ */

function isPromoOrEventDoc(doc) {
  if (!doc) return false;
  const t = String(doc.canonicalType || doc.kind || doc.type || '').toLowerCase();
  return t === 'promotion' || t === 'event';
}

function hydratePromoOrEventDetails(doc) {
  if (!doc || !isPromoOrEventDoc(doc)) return doc;

  const businessAddress = doc.businessAddress || null;

  if (doc.details && (doc.details.startsAt || doc.details.startTime)) {
    if (businessAddress && !doc.details.address) {
      doc.details = { ...doc.details, address: businessAddress };
    }
    return doc;
  }

  const canonical = String(doc.canonicalType || doc.kind || doc.type || '').toLowerCase();

  const description = doc.description ?? doc.details?.description ?? null;
  const recurring = typeof doc.recurring === 'boolean' ? doc.recurring : doc.details?.recurring ?? false;

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

function normalizeSharedSuggestion(post) {
  if (!post || post.type !== 'sharedPost') return post;

  if (post.original && isPromoOrEventDoc(post.original)) {
    const canonical = String(
      post.original.canonicalType || post.original.kind || post.original.type || ''
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
      post.shared.snapshot.canonicalType || post.shared.snapshot.kind || post.shared.snapshot.type || ''
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

function applySharedPromoEventHydration(post) {
  if (!post || post.type !== 'sharedPost') return post;

  if (post.original && isPromoOrEventDoc(post.original)) hydratePromoOrEventDetails(post.original);
  if (post.shared?.snapshot && isPromoOrEventDoc(post.shared.snapshot)) hydratePromoOrEventDetails(post.shared.snapshot);

  normalizeSharedSuggestion(post);
  return post;
}

/* ------------------------------------------------------------------ */
/* Main hydration entry points                                        */
/* ------------------------------------------------------------------ */

async function hydratePostForResponse(raw, opts = {}) {
  const {
    viewerId = null,
    originalMap = null,
    attachBusinessNameIfMissing = null,
    applyInviteFeedFilter = false,
  } = opts;

  if (!raw) return raw;

  // load original for shared posts
  if (raw.type === 'sharedPost' && raw.shared?.originalPostId) {
    const id = String(raw.shared.originalPostId);
    const original = await loadOriginalById(id, originalMap);
    if (original) raw.original = original;
  }

  // If this post is a past invite the viewer shouldn't see, return null.
  if (applyInviteFeedFilter && raw.type === 'invite') {
    const filtered = await filterInvitesForViewer([raw], viewerId);
    if (!filtered.length) return null;
    raw = filtered[0];
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
    if (enriched.original) await attachBusinessNameIfMissing(enriched.original);
    if (enriched.shared?.snapshot) await attachBusinessNameIfMissing(enriched.shared.snapshot);
  }

  applySharedPromoEventHydration(enriched);
  return enriched;
}

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

  // Attach originals before invite filtering (shared invites need their original to be evaluated)
  for (const p of posts) {
    if (p.type === 'sharedPost' && p?.shared?.originalPostId) {
      const o = originalMap.get(String(p.shared.originalPostId));
      if (o) p.original = o;
    }
  }

  // ✅ NEW: invite filtering (batch)
  posts = await filterInvitesForViewer(posts, viewerId);
  if (!Array.isArray(posts) || posts.length === 0) return [];

  const flat = [];
  const structure = [];

  for (const p of posts) {
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
      if (top.original) await attachBusinessNameIfMissing(top.original);
      if (top.shared?.snapshot) await attachBusinessNameIfMissing(top.shared.snapshot);
    }

    applySharedPromoEventHydration(top);
    out.push(top);
  }

  return out;
}

module.exports = {
  hydratePostForResponse,
  hydrateManyPostsForResponse,
};
