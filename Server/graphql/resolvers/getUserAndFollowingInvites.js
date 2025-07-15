const User = require('../../models/User');
const Business = require('../../models/Business');
const ActivityInvite = require('../../models/ActivityInvites');
const { getPresignedUrl } = require('../../utils/cachePresignedUrl');
const { enrichComments } = require('../../utils/userPosts');

const getUserAndFollowingInvites = async (_, { userId }) => {
  try {
    const user = await User.findById(userId)
      .select('following firstName lastName profilePic')
      .lean();
    if (!user) throw new Error("User not found");

    const followingIds = (user.following || []).map(id => id.toString());

    const [userInvitesRaw, followingPublicInvitesRaw] = await Promise.all([
      ActivityInvite.find({
        $or: [
          { senderId: userId },
          { 'recipients.userId': userId }
        ]
      }).lean(),
      ActivityInvite.find({
        senderId: { $in: followingIds },
        isPublic: true,
      }).lean()
    ]);

    const allInvites = [...userInvitesRaw, ...followingPublicInvitesRaw];

    const senderIds = allInvites.map(i => i.senderId.toString());
    const recipientIds = allInvites.flatMap(i => i.recipients.map(r => r.userId.toString()));
    const requestIds = allInvites.flatMap(i => i.requests?.map(r => r.userId.toString()) || []);
    const allUserIds = [...new Set([...senderIds, ...recipientIds, ...requestIds])];
    const placeIds = [...new Set(allInvites.map(i => i.placeId).filter(Boolean))];

    const [users, businesses] = await Promise.all([
      User.find({ _id: { $in: allUserIds } }).lean(),
      Business.find({ placeId: { $in: placeIds } }).lean()
    ]);

    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const businessMap = new Map(businesses.map(b => [b.placeId, b]));

    const photoKeys = [];

    for (const u of users) {
      if (u.profilePic?.photoKey) photoKeys.push(u.profilePic.photoKey);
    }

    for (const b of businesses) {
      if (b.logoKey) photoKeys.push(b.logoKey);
    }

    const allCommentMedia = allInvites.flatMap(inv => inv.comments || []).flatMap(c => {
      const media = [];
      if (c.media?.photoKey) media.push(c.media.photoKey);
      for (const r of c.replies || []) {
        if (r.media?.photoKey) media.push(r.media.photoKey);
      }
      return media;
    });

    photoKeys.push(...allCommentMedia);

    const presignedMap = {};
    await Promise.all(
      photoKeys.map(async (key) => {
        presignedMap[key] = await getPresignedUrl(key);
      })
    );

    const enrichInvite = async (invite) => {
      const sender = userMap.get(invite.senderId.toString());
      const senderPicKey = sender?.profilePic?.photoKey;
      const senderProfilePicUrl = senderPicKey ? presignedMap[senderPicKey] : null;

      const enrichedRecipients = invite.recipients.map(r => {
        const rec = userMap.get(r.userId.toString());
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
        const req = userMap.get(r.userId.toString());
        const picKey = req?.profilePic?.photoKey;
        return {
          _id: r._id?.toString(),
          userId: r.userId.toString(),
          status: r.status,
          firstName: req?.firstName || '',
          lastName: req?.lastName || '',
          profilePicUrl: picKey ? presignedMap[picKey] : null,
        };
      });

      const business = businessMap.get(invite.placeId);
      const businessLogoUrl = business?.logoKey ? presignedMap[business.logoKey] : null;

      const enrichedComments = await enrichComments(invite.comments || [], presignedMap);

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
        isPublic: invite.isPublic,
        status: invite.status,
        likes: invite.likes || [],
        comments: enrichedComments,
        createdAt: invite.createdAt?.toISOString() || null,
        type: 'invite',
      };
    };

    const userInvites = await Promise.all(userInvitesRaw.map(enrichInvite));
    const followingInvites = await Promise.all(followingPublicInvitesRaw.map(enrichInvite));

    return {
      user,
      userInvites,
      friendPublicInvites: followingInvites,
    };
  } catch (err) {
    console.error("❌ Error in getUserAndFollowingInvites resolver:", err);
    throw new Error("Failed to fetch user and following invites");
  }
};

module.exports = {
  getUserAndFollowingInvites,
};
