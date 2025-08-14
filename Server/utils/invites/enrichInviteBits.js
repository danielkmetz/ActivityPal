const mongoose = require('mongoose');
const User = require('../../models/User');
const Business = require('../../models/Business');
const { getPresignedUrl } = require('../cachePresignedUrl');

// --- Single user (kept for convenience) ---
async function toInviteUserShape(userId) {
  if (!userId) return null;
  const idStr = userId.toString();
  const u = await User.findById(idStr).select('firstName lastName profilePic').lean();
  if (!u) return null;

  let profilePicUrl = null;
  if (u?.profilePic?.photoKey) {
    try {
      profilePicUrl = await getPresignedUrl(u.profilePic.photoKey);
    } catch { /* leave null on presign failure */ }
  }

  return {
    id: idStr,
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    profilePicUrl,
  };
}

// --- Batch version for many users (prevents N+1) ---
async function toInviteUsersShape(userIds = []) {
  const ids = [...new Set(
    userIds
      .filter(Boolean)
      .map((id) => id?.toString?.() || String(id))
  )];
  if (!ids.length) return {};

  const users = await User.find({ _id: { $in: ids } })
    .select('firstName lastName profilePic')
    .lean();

  // Map -> shape
  const map = {};
  // Optionally presign in parallel
  await Promise.all(users.map(async (u) => {
    let url = null;
    if (u?.profilePic?.photoKey) {
      try {
        url = await getPresignedUrl(u.profilePic.photoKey);
      } catch { /* swallow */ }
    }
    map[u._id.toString()] = {
      id: u._id.toString(),
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      profilePicUrl: url,
    };
  }));
  return map; // { [userId]: InviteUser }
}

function pickRecipientUserId(r) {
  // Supports: r.user as ObjectId | {_id} | {id} | userId as string/ObjectId
  return r?.user?._id || r?.user?.id || r?.user || r?.userId || null;
}

// --- Recipients with batching, preserves order ---
async function toInviteRecipientsShape(recipients = []) {
  const ids = recipients
    .map(pickRecipientUserId)
    .filter(Boolean)
    .map((id) => id?.toString?.() || String(id));

  const userMap = await toInviteUsersShape(ids);

  return recipients.map((r) => {
    const uid = pickRecipientUserId(r);
    const shaped = uid ? userMap[uid.toString()] : null;
    return shaped
      ? { user: shaped, status: r?.status || 'pending' }
      : null;
  }).filter(Boolean);
}

async function lookupBusinessBits(placeId) {
  if (!placeId) return { businessName: null, businessLogoUrl: null };
  const biz = await Business.findOne({ placeId })
    .select('businessName logoKey')
    .lean();

  let businessLogoUrl = null;
  if (biz?.logoKey) {
    try {
      businessLogoUrl = await getPresignedUrl(biz.logoKey);
    } catch { /* leave null */ }
  }

  return {
    businessName: biz?.businessName || null,
    businessLogoUrl,
  };
}

module.exports = {
  toInviteUserShape,
  toInviteUsersShape,
  toInviteRecipientsShape,
  lookupBusinessBits,
};
