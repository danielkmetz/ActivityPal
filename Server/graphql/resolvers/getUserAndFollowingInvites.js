const mongoose = require('mongoose');
const User = require('../../models/User');
const Business = require('../../models/Business');
const ActivityInvite = require('../../models/ActivityInvites');
const { getPresignedUrl } = require('../../utils/cachePresignedUrl');
const { enrichComments } = require('../../utils/userPosts');

const getUserAndFollowingInvites = async (_, { userId, excludeAuthorIds = [] }) => {
  try {
    // 🔎 Validate
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId format');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 👥 Load me + following (for public friend invites bucket)
    const user = await User.findById(userObjectId)
      .select('following firstName lastName profilePic')
      .lean();
    if (!user) throw new Error('User not found');

    // Build exclude sets (both string + ObjectId)
    const excludeSet = new Set((excludeAuthorIds || []).map(String));
    const excludeOids = (excludeAuthorIds || [])
      .map(id => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : null))
      .filter(Boolean);

    // Following -> filter out blocked authors early
    const followingIdsStr = (user.following || []).map(String);
    const allowedFollowingStr = followingIdsStr.filter(id => !excludeSet.has(id));
    const allowedFollowingOids = allowedFollowingStr.map(id => new mongoose.Types.ObjectId(id));

    // ------------------------------
    // 1) My invites (where I'm sender OR recipient), excluding blocked participants
    // ------------------------------
    const userInvitesRaw = await ActivityInvite.find({
      $and: [
        { $or: [{ senderId: userObjectId }, { 'recipients.userId': userObjectId }] },
        // Exclude if the sender is blocked
        ...(excludeOids.length ? [{ senderId: { $nin: excludeOids } }] : []),
        // Exclude if ANY recipient is blocked
        ...(excludeOids.length ? [{ 'recipients.userId': { $nin: excludeOids } }] : []),
        // Exclude if ANY requestor is blocked (if you model requests)
        ...(excludeOids.length ? [{ 'requests.userId': { $nin: excludeOids } }] : []),
      ],
    }).lean();

    // ------------------------------
    // 2) Public invites from my (allowed) following only; exclude blocked participants
    // ------------------------------
    const followingPublicInvitesRaw = allowedFollowingOids.length
      ? await ActivityInvite.find({
          senderId: { $in: allowedFollowingOids },
          isPublic: true,
          // Also ensure original sender isn’t blocked (already ensured by allowedFollowingOids)
          ...(excludeOids.length ? { 'recipients.userId': { $nin: excludeOids } } : {}),
          ...(excludeOids.length ? { 'requests.userId': { $nin: excludeOids } } : {}),
        }).lean()
      : [];

    // ------------------------------
    // 3) Enrichment (unchanged)
    // ------------------------------
    const allInvites = [...userInvitesRaw, ...followingPublicInvitesRaw];

    const senderIds = allInvites.map(i => String(i.senderId));
    const recipientIds = allInvites.flatMap(i => (i.recipients || []).map(r => String(r.userId)));
    const requestIds = allInvites.flatMap(i => (i.requests || []).map(r => String(r.userId)));
    const allUserIds = [...new Set([...senderIds, ...recipientIds, ...requestIds])];

    const placeIds = [
      ...new Set(
        allInvites
          .map(i => i.placeId)
          .filter(Boolean)
      ),
    ];

    const [users, businesses] = await Promise.all([
      allUserIds.length
        ? User.find({ _id: { $in: allUserIds.map(id => new mongoose.Types.ObjectId(id)) } }).lean()
        : [],
      placeIds.length ? Business.find({ placeId: { $in: placeIds } }).lean() : [],
    ]);

    const userMap = new Map(users.map(u => [String(u._id), u]));
    const businessMap = new Map(businesses.map(b => [b.placeId, b]));

    // Collect all media keys (user pics, business logos, comment media)
    const photoKeys = [];
    for (const u of users) {
      if (u?.profilePic?.photoKey) photoKeys.push(u.profilePic.photoKey);
    }
    for (const b of businesses) {
      if (b?.logoKey) photoKeys.push(b.logoKey);
    }
    const allCommentMedia = allInvites
      .flatMap(inv => inv.comments || [])
      .flatMap(c => {
        const media = [];
        if (c?.media?.photoKey) media.push(c.media.photoKey);
        for (const r of c.replies || []) {
          if (r?.media?.photoKey) media.push(r.media.photoKey);
        }
        return media;
      });
    photoKeys.push(...allCommentMedia);

    const presignedMap = {};
    await Promise.all(
      photoKeys.map(async key => {
        try {
          presignedMap[key] = await getPresignedUrl(key);
        } catch {
          presignedMap[key] = null;
        }
      })
    );

    const enrichInvite = async (invite) => {
      const sender = userMap.get(String(invite.senderId));
      const senderPicKey = sender?.profilePic?.photoKey;
      const senderProfilePicUrl = senderPicKey ? presignedMap[senderPicKey] : null;

      const enrichedRecipients = (invite.recipients || []).map(r => {
        const rec = userMap.get(String(r.userId));
        const picKey = rec?.profilePic?.photoKey;
        return {
          user: {
            id: rec?._id || r.userId,
            firstName: rec?.firstName || '',
            lastName: rec?.lastName || '',
            profilePicUrl: picKey ? presignedMap[picKey] : null,
          },
          status: r.status,
        };
      });

      const enrichedRequests = (invite.requests || []).map(r => {
        const req = userMap.get(String(r.userId));
        const picKey = req?.profilePic?.photoKey;
        return {
          _id: r._id?.toString(),
          userId: String(r.userId),
          status: r.status,
          firstName: req?.firstName || '',
          lastName: req?.lastName || '',
          profilePicUrl: picKey ? presignedMap[picKey] : null,
        };
      });

      const business = invite.placeId ? businessMap.get(invite.placeId) : null;
      const businessLogoUrl = business?.logoKey ? presignedMap[business.logoKey] : null;

      const comments = await enrichComments(invite.comments || [], presignedMap);

      return {
        _id: invite._id,
        sender: {
          id: sender?._id,
          firstName: sender?.firstName || '',
          lastName: sender?.lastName || '',
          profilePicUrl: senderProfilePicUrl,
        },
        recipients: enrichedRecipients,
        placeId: invite.placeId,
        businessName: business?.businessName || '',
        businessLogoUrl,
        note: invite.note,
        dateTime: invite.dateTime?.toISOString() || null,
        message: invite.message,
        requests: enrichedRequests,
        isPublic: !!invite.isPublic,
        status: invite.status,
        likes: invite.likes || [],
        comments,
        createdAt: invite.createdAt?.toISOString() || null,
        type: 'invite',
      };
    };

    const [userInvites, followingInvites] = await Promise.all([
      Promise.all(userInvitesRaw.map(enrichInvite)),
      Promise.all(followingPublicInvitesRaw.map(enrichInvite)),
    ]);

    // Safety: final guard in case anything slipped past the query
    const guardOut = arr =>
      arr.filter(inv => {
        const sender = String(inv?.sender?.id || '');
        if (excludeSet.has(sender)) return false;
        for (const r of inv.recipients || []) {
          if (excludeSet.has(String(r?.user?.id))) return false;
        }
        for (const rq of inv.requests || []) {
          if (excludeSet.has(String(rq?.userId))) return false;
        }
        return true;
      });

    return {
      user,
      userInvites: guardOut(userInvites),
      friendPublicInvites: guardOut(followingInvites),
    };
  } catch (err) {
    console.error('❌ Error in getUserAndFollowingInvites resolver:', err);
    throw new Error('Failed to fetch user and following invites');
  }
};

module.exports = {
  getUserAndFollowingInvites,
};
