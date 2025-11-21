const mongoose = require('mongoose');
const { Types: { ObjectId } } = mongoose;
const User = require('../models/User');                    // <- adjust path if needed
const { getPresignedUrl } = require('./cachePresignedUrl'); // <- adjust path if needed

// ---------------- debug helpers ----------------
const DEBUG = '2' === '1';
const dlog = (...args) => { if (DEBUG) console.log('[enrich]', ...args); };
const dpost = (post, msg, extra) => {
  if (!DEBUG) return;
  const id = post?._id ? String(post._id) : 'unknown';
  console.log(`[enrich][post ${id}] ${msg}`, extra ?? '');
};

// ---------------- tiny utils ----------------
const toStr = (v) => (v == null ? null : String(v));
const fullNameOf = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || null;

function normalizeUserId(anyShape) {
  const s = toStr(
    anyShape?.userId ??
    anyShape?.id ??
    anyShape?._id ??
    anyShape?.user?.id ??
    anyShape?.user?._id ??
    anyShape
  );
  return (s && ObjectId.isValid(s)) ? new ObjectId(s) : null;
}

function extractTaggedUserIds(list = []) {
  return list.map(normalizeUserId).filter(Boolean);
}

function deriveBusinessIdentity(p = {}) {
  const placeId =
    p.placeId ??
    p.details?.placeId ??
    p.details?.place?.placeId ??
    p.refs?.business?.placeId ??
    p.location?.placeId ??
    p.shared?.snapshot?.placeId ??
    p.shared?.snapshot?.refs?.business?.placeId ??   // NEW
    null;

  const businessName =
    p.businessName ??
    p.details?.businessName ??
    p.details?.placeName ??
    p.details?.place?.name ??
    p.refs?.business?.name ??
    p.location?.name ??
    p.shared?.snapshot?.businessName ??
    p.shared?.snapshot?.refs?.business?.name ??      // NEW
    null;

  return { placeId, businessName };
}

// ---------------- batch fetch user summaries ----------------
async function fetchUserSummaries(userIds) {
  const ids = [...new Set((userIds || []).map(toStr).filter(Boolean))];
  const oids = ids.filter(ObjectId.isValid).map((s) => new ObjectId(s));

  dlog('fetchUserSummaries: in ids=', ids.length, 'valid oids=', oids.length);

  if (!oids.length) return new Map();

  const rows = await User.find({ _id: { $in: oids } })
    .select('_id firstName lastName profilePic')
    .lean();

  dlog('fetchUserSummaries: found users=', rows.length, 'ids=', rows.map(r => String(r._id)));

  // sign pics concurrently
  const signed = await Promise.all(rows.map(async (u) => ({
    u,
    profilePicUrl: u?.profilePic?.photoKey ? await getPresignedUrl(u.profilePic.photoKey) : null,
  })));

  const map = new Map();
  for (const { u, profilePicUrl } of signed) {
    const id = String(u._id);
    map.set(id, {
      id,
      firstName: u.firstName || null,
      lastName: u.lastName || null,
      fullName: fullNameOf(u),
      profilePicUrl,
    });
    dlog('userSummary:', id, { fullName: fullNameOf(u), hasPic: !!profilePicUrl });
  }
  return map;
}

// ---------------- collect all userIds we need ----------------
function collectUserIdsFromPosts(posts) {
  const out = new Set();

  const asId = (t) => {
    // Accept ObjectId instance, 24-hex string, or tag objects with various shapes
    if (t == null) return null;

    // primitive or ObjectId
    const prim = toStr(t);
    if (prim && ObjectId.isValid(prim)) return prim;

    // object shapes
    const cand =
      toStr(t.userId) ||
      toStr(t.id) ||
      toStr(t._id) ||
      toStr(t?.user?.id) ||
      toStr(t?.user?._id);

    return cand && ObjectId.isValid(cand) ? cand : null;
  };

  const collectFromCommentTree = (arr = []) => {
    for (const c of arr) {
      const uid = asId(c?.userId);
      if (uid) out.add(uid);
      for (const l of c?.likes || []) {
        const lid = asId(l?.userId ?? l);
        if (lid) out.add(lid);
      }
      if (Array.isArray(c?.replies) && c.replies.length) collectFromCommentTree(c.replies);
    }
  };

  for (const p of posts) {
    // owner (only Users)
    if (p?.ownerModel === 'User' && p?.ownerId) {
      const oid = asId(p.ownerId);
      if (oid) out.add(oid);
    }

    // ✅ top-level tags (ObjectId[], string[], or objects)
    for (const t of p?.taggedUsers || []) {
      const uid = asId(t);
      if (uid) out.add(uid);
    }

    // media-level tags (array of objects or ids)
   const mediaOrPhotos = p?.media || p?.photos || [];
    for (const m of mediaOrPhotos) {
      for (const t of m?.taggedUsers || []) {
        const uid = asId(t);
        if (uid) out.add(uid);
      }
    }

    // likes
    for (const l of p?.likes || []) {
      const lid = asId(l?.userId ?? l);
      if (lid) out.add(lid);
    }

    // comments/replies
    collectFromCommentTree(p?.comments || []);

    // invite details
    const d = p?.details || {};
    for (const r of d.recipients || []) {
      const uid = asId(r?.userId ?? r?.user);
      if (uid) out.add(uid);
    }
    for (const rq of d.requests || []) {
      const uid = asId(rq?.userId ?? rq?.user);
      if (uid) out.add(uid);
    }
  }

  const ids = [...out];
  dlog('collectUserIdsFromPosts: unique ids=', ids.length);
  return ids;
}

// ---------------- media / tags / likes / comments enrichers ----------------
async function enrichMedia(media = [], userMap) {
  const out = [];
  for (const m of (media || [])) {
    const url = m?.photoKey ? await getPresignedUrl(m.photoKey) : (m?.url || null);
    const taggedUsers = enrichTaggedUsers(m?.taggedUsers || [], userMap); // hydrate x/y + names
    out.push({ ...m, url, taggedUsers });
  }
  return out;
}

function enrichTaggedUsers(list = [], userMap) {
  const normalizeId = (t) => {
    // primitive or ObjectId
    const prim = toStr(t);
    if (prim && ObjectId.isValid(prim)) return prim;

    // object shapes
    const cand =
      toStr(t?.userId) ||
      toStr(t?.id) ||
      toStr(t?._id) ||
      toStr(t?.user?.id) ||
      toStr(t?.user?._id);

    return cand && ObjectId.isValid(cand) ? cand : null;
  };

  return (list || []).map((t, i) => {
    const id = normalizeId(t);
    const u = id ? userMap.get(id) : null;

    if (DEBUG && i < 3) dlog('taggedUser enrich:', { id, hit: !!u });

    // Keep x/y if present (photo-level tags), otherwise null
    const x = t?.x ?? null;
    const y = t?.y ?? null;

    // Prefer hydrated values; fall back to any name/pic present on the tag object
    const firstName = u?.firstName ?? t?.firstName ?? null;
    const lastName  = u?.lastName  ?? t?.lastName  ?? null;
    const fullName  = u?.fullName  ?? t?.fullName  ?? (firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null);
    const profilePicUrl = u?.profilePicUrl ?? t?.profilePicUrl ?? null;

    return {
      userId: id,          // stable field used throughout your app
      firstName,
      lastName,
      fullName,
      profilePicUrl,
      x,
      y,
    };
  });
}

function enrichLikes(likes = [], userMap) {
  return (likes || []).map((l, i) => {
    const id = toStr(l?.userId || l?._id);
    const u = id ? userMap.get(id) : null;
    if (DEBUG && i < 3) dlog('like enrich:', { id, hit: !!u });
    return { userId: id, fullName: u?.fullName || l?.fullName || null };
  });
}

function enrichComments(comments = [], userMap, depth = 0) {
  const walk = (arr = [], d = 0) =>
    (arr || []).map((c, i) => {
      const id = toStr(c?.userId);
      const u = id ? userMap.get(id) : null;
      if (DEBUG && d < 1 && i < 2) dlog('comment enrich:', { id, hit: !!u });
      return {
        ...c,
        userId: id,
        fullName: u?.fullName || c?.fullName || null,
        likes: enrichLikes(c?.likes, userMap),
        replies: walk(c?.replies, d + 1),
        media: c?.media,
      };
    });
  return walk(comments, depth);
}

function enrichInviteDetails(details, userMap) {
  if (!details) return details;

  const recipients = (details.recipients || []).map((r, i) => {
    const id = toStr(r?.userId || r?.user?.id || r?.user?._id);
    const u = id ? userMap.get(id) : null;
    if (DEBUG && i < 3) dlog('invite recipient enrich:', { id, hit: !!u });
    return {
      user: u
        ? {
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            profilePicUrl: u.profilePicUrl,
          }
        : null,
      status: r?.status || 'pending',
    };
  });

  const requests = (details.requests || []).map((rq, i) => {
    const id = toStr(rq?.userId);
    const u = id ? userMap.get(id) : null;
    if (DEBUG && i < 3) dlog('invite request enrich:', { id, hit: !!u });
    return {
      _id: rq?._id,
      userId: id,
      status: rq?.status || 'pending',
      firstName: u?.firstName || null,
      lastName: u?.lastName || null,
      profilePicUrl: u?.profilePicUrl || null,
    };
  });

  return { ...details, recipients, requests };
}

// ---------------- universal post enricher ----------------
async function enrichPostUniversal(post, userMap) {
  dpost(post, 'owner check', { ownerModel: post?.ownerModel, ownerId: String(post?.ownerId || '') });

  // ---------- normalize media/photos so promos/events also get URLs ----------
  const hasMedia = Array.isArray(post?.media) && post.media.length > 0;
  const hasPhotos = Array.isArray(post?.photos) && post.photos.length > 0;

  // If media is missing but photos exist (Promotions/Events, or snapshots),
  // treat photos as media for the purposes of signing + tags.
  const rawMedia = hasMedia
    ? post.media
    : hasPhotos
      ? post.photos
      : [];

  const media = await enrichMedia(rawMedia, userMap);

  // only derive owner summary for user-owned posts
  const owner =
    post?.ownerModel === 'User' && post?.ownerId
      ? userMap.get(String(post.ownerId))
      : null;

  if (DEBUG) dpost(post, 'owner hit?', { found: !!owner, owner });

  const taggedUsers = enrichTaggedUsers(post?.taggedUsers || [], userMap);
  const likes = enrichLikes(post?.likes || [], userMap);
  const comments = enrichComments(post?.comments || [], userMap);

  // derive business identity from multiple shapes,
  // now also including normalized media if it ever carries business refs
  const { placeId, businessName } = deriveBusinessIdentity(post);

  let details = post?.details || null;
  if (post?.type === 'review' && details) {
    details = { ...details, fullName: owner?.fullName || null };
    if (DEBUG) dpost(post, 'review details.fullName', details.fullName);
  } else if (post?.type === 'invite' && details) {
    details = enrichInviteDetails(details, userMap);
  }

  const enriched = {
    ...post,                // keep original fields if already present
    media,
    // Keep .photos in sync for things that only had photos before
    ...(hasPhotos && !hasMedia ? { photos: media } : {}),
    taggedUsers,
    likes,
    comments,
    details,
    placeId: placeId ?? post.placeId ?? null,
    businessName: businessName ?? post.businessName ?? null,
    owner: owner
      ? {
          id: owner.id,
          firstName: owner.firstName,
          lastName: owner.lastName,
          fullName: `${owner.firstName} ${owner.lastName}`,
          profilePicUrl: owner.profilePicUrl,
        }
      : undefined,
  };

  if (DEBUG) {
    dpost(post, 'final owner summary (top-level)', {
      fullName: enriched.fullName,
      profilePicUrl: enriched.owner?.profilePicUrl ? 'yes' : 'no',
    });
  }

  return enriched;
}

async function enrichOneOrMany(postOrPosts) {
  const arr = Array.isArray(postOrPosts) ? postOrPosts : [postOrPosts];
  const userIds = collectUserIdsFromPosts(arr);
  const userMap = await fetchUserSummaries(userIds);
  const enriched = await Promise.all(arr.map((p) => enrichPostUniversal(p, userMap)));
  return Array.isArray(postOrPosts) ? enriched : enriched[0];
}

module.exports = {
  fetchUserSummaries,
  collectUserIdsFromPosts,
  enrichOneOrMany,
  normalizeUserId,
  extractTaggedUserIds,
  enrichPostUniversal,
};
