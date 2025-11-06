// utils/enrichPosts.js
'use strict';

const mongoose = require('mongoose');
const { Types: { ObjectId } } = mongoose;
const User = require('../models/User');                    // <- adjust path if needed
const { getPresignedUrl } = require('./cachePresignedUrl'); // <- adjust path if needed

// ---------------- debug helpers ----------------
const DEBUG = '1' === '1';
const dlog = (...args) => { if (DEBUG) console.log('[enrich]', ...args); };
const dpost = (post, msg, extra) => {
  if (!DEBUG) return;
  const id = post?._id ? String(post._id) : 'unknown';
  console.log(`[enrich][post ${id}] ${msg}`, extra ?? '');
};

// ---------------- tiny utils ----------------
const toStr = (v) => (v == null ? null : String(v));
const fullNameOf = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ') || null;

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

  const collectFromCommentTree = (arr = []) => {
    for (const c of arr) {
      if (c?.userId) out.add(String(c.userId));
      for (const l of c?.likes || []) if (l?.userId) out.add(String(l.userId));
      if (Array.isArray(c?.replies) && c.replies.length) collectFromCommentTree(c.replies);
    }
  };

  for (const p of posts) {
    // only collect owner if it's a User
    if (p?.ownerModel === 'User' && p?.ownerId) out.add(String(p.ownerId));

    // top-level tags
    for (const t of p?.taggedUsers || []) if (t?.userId) out.add(String(t.userId));

    // media-level tags
    for (const m of p?.media || []) {
      for (const t of m?.taggedUsers || []) if (t?.userId) out.add(String(t.userId));
    }

    // likes
    for (const l of p?.likes || []) if (l?.userId) out.add(String(l.userId));

    // comments/replies
    collectFromCommentTree(p?.comments || []);

    // invite details
    const d = p?.details || {};
    for (const r of d.recipients || []) {
      const uid = r?.userId || r?.user?.id || r?.user?._id;
      if (uid) out.add(String(uid));
    }
    for (const rq of d.requests || []) if (rq?.userId) out.add(String(rq.userId));
  }

  const ids = [...out];
  dlog('collectUserIdsFromPosts: unique ids=', ids.length);
  return ids;
}

// ---------------- media / tags / likes / comments enrichers ----------------
async function enrichMedia(media = []) {
  const out = [];
  for (const m of media) {
    const url = m?.photoKey ? await getPresignedUrl(m.photoKey) : m?.url || null;
    if (DEBUG && m?.photoKey) dlog('sign photoKey:', m.photoKey, '-> url?', !!url);
    out.push({ ...m, url });
  }
  return out;
}

function enrichTaggedUsers(list = [], userMap) {
  return (list || []).map((t, i) => {
    const id = toStr(t?.userId || t?._id);
    const u = id ? userMap.get(id) : null;
    if (DEBUG && i < 3) dlog('taggedUser enrich:', { id, hit: !!u });
    return {
      userId: id,
      fullName: u?.fullName || t?.fullName || null,
      profilePicUrl: u?.profilePicUrl || t?.profilePicUrl || null,
      x: t?.x,
      y: t?.y,
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

  // only derive owner summary for user-owned posts
  const owner =
    post?.ownerModel === 'User' && post?.ownerId
      ? userMap.get(String(post.ownerId))
      : null;

  if (DEBUG) dpost(post, 'owner hit?', { found: !!owner, owner });

  const media = await enrichMedia(post?.media || []);
  const taggedUsers = enrichTaggedUsers(post?.taggedUsers || [], userMap);
  const likes = enrichLikes(post?.likes || [], userMap);
  const comments = enrichComments(post?.comments || [], userMap);

  let details = post?.details || null;
  if (post?.type === 'review' && details) {
    details = { ...details, fullName: owner?.fullName || null };
    if (DEBUG) dpost(post, 'review details.fullName', details.fullName);
  } else if (post?.type === 'invite' && details) {
    details = enrichInviteDetails(details, userMap);
  }

  const enriched = {
    ...post,
    media,
    taggedUsers,
    likes,
    comments,
    details,
    // RN conveniences: only for User owners
    fullName: owner?.fullName || undefined,
    profilePicUrl: owner?.profilePicUrl || undefined,
    user: owner
      ? {
          id: owner.id,
          firstName: owner.firstName,
          lastName: owner.lastName,
          profilePicUrl: owner.profilePicUrl,
        }
      : undefined,
  };

  if (DEBUG) dpost(post, 'final owner summary (top-level)', {
    fullName: enriched.fullName,
    profilePicUrl: enriched.profilePicUrl ? 'yes' : 'no',
  });

  return enriched;
}

module.exports = {
  fetchUserSummaries,
  collectUserIdsFromPosts,
  enrichPostUniversal,
};
