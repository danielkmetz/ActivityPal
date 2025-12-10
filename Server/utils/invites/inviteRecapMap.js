const mongoose = require('mongoose');
const { Types: { ObjectId } } = mongoose;
const { Post } = require('../../models/Post');
const { deriveBusinessIdentity } = require('../posts/deriveBusinessIdentity');

const toStr = (v) => (v == null ? null : String(v));

async function buildRecapMapForUser(posts = [], viewerId) {
  const viewerStr = toStr(viewerId);
  if (!viewerStr || !ObjectId.isValid(viewerStr)) return new Map();

  const viewerOid = new ObjectId(viewerStr);

  // ---- collect invite metadata from this batch ----
  const invites = (posts || []).filter((p) => p && p.type === 'invite' && p._id);
  if (!invites.length) return new Map();

  const inviteMetas = invites
    .map((inv) => {
      const idStr = toStr(inv._id);
      if (!idStr || !ObjectId.isValid(idStr)) return null;

      const details = inv.details || {};

      const { placeId: derivedPlaceId } = deriveBusinessIdentity(inv);
      const placeId = derivedPlaceId || inv.placeId || null;

      // normalize invite dateTime → Date | null
      let dateTime = null;
      const raw = details.dateTime;
      if (raw instanceof Date) {
        dateTime = raw;
      } else if (raw) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) dateTime = parsed;
      }

      return {
        inviteId: new ObjectId(idStr),
        inviteIdStr: idStr,
        placeId,
        dateTime,
      };
    })
    .filter(Boolean);

  if (!inviteMetas.length) return new Map();

  const inviteIds = inviteMetas.map((m) => m.inviteId);

  // ---- 1) Explicit recaps via refs.relatedInviteId ----
  const explicitRecaps = await Post.find({
    ownerId: viewerOid,
    type: { $in: ['review', 'check-in'] },
    'refs.relatedInviteId': { $in: inviteIds },
  })
    .select('refs.relatedInviteId')
    .lean();

  const map = new Map();
  for (const r of explicitRecaps) {
    const invId = r?.refs?.relatedInviteId;
    if (invId) map.set(String(invId), true);
  }

  // ---- 2) Heuristic recaps by placeId + time window for invites not covered above ----
  const windowMinutesBefore = 60;      // 1 hour before start
  const windowMinutesAfter = 6 * 60;   // 6 hours after start

  const pendingMetas = inviteMetas.filter(
    (m) => !map.has(m.inviteIdStr) && m.placeId && m.dateTime
  );

  for (const meta of pendingMetas) {
    const start = new Date(
      meta.dateTime.getTime() - windowMinutesBefore * 60 * 1000
    );
    const end = new Date(
      meta.dateTime.getTime() + windowMinutesAfter * 60 * 1000
    );

    const recap = await Post.findOne({
      ownerId: viewerOid,
      type: { $in: ['review', 'check-in'] },
      placeId: meta.placeId,
      createdAt: { $gte: start, $lte: end },
    })
      .select('_id')
      .lean();

    if (recap) {
      map.set(meta.inviteIdStr, true);
    }
  }

  return map;
}

module.exports = {
  buildRecapMapForUser,
};
