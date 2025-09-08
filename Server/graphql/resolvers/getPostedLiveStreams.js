const mongoose = require('mongoose');
const User = require('../../models/User');
const LiveStream = require('../../models/LiveStream');
const { resolveUserProfilePics } = require('../../utils/userPosts');

const getPostedLiveStreams = async (_parent, { userId }) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId format');
    }
    const viewerId = new mongoose.Types.ObjectId(userId);

    const viewer = await User.findById(viewerId).select('following').lean();
    if (!viewer) throw new Error('User not found');

    const allUserIds = [viewerId, ...(viewer.following || [])];

    // Profile pics/URLs must come from the resolver map
    const profilePicMap = await resolveUserProfilePics(allUserIds);

    // Only fetch first/last (no fullName field)
    const userDocs = await User.find({ _id: { $in: allUserIds } })
      .select('_id firstName lastName')
      .lean();

    const usersById = {};
    for (const u of userDocs) {
      const computed = [u.firstName, u.lastName].filter(Boolean).join(' ') || null;
      usersById[u._id.toString()] = { fullName: computed };
    }

    const lives = await LiveStream.find({
      hostUserId: { $in: allUserIds },
      isPosted: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    const items = lives.map((ls) => {
      const hostIdStr = ls.hostUserId?.toString?.() || '';
      const nameMeta = usersById[hostIdStr] || {};
      const picMeta = profilePicMap[hostIdStr] || {};

      const date = ls.endedAt || ls.startedAt || ls.createdAt;

      return {
        _id: ls._id,
        userId: hostIdStr,

        // fullName is derived from firstName + lastName
        fullName: nameMeta.fullName || null,

        // URL only from resolver; raw key is optional
        profilePic: picMeta.profilePic ?? null,
        profilePicUrl: picMeta.profilePicUrl ?? null,
        caption: ls.caption ?? null,   // <-- NEW: include caption
        date,
        playbackUrl: ls.playbackUrl || null,
        vodUrl: ls.recording?.vodUrl || null,
        coverKey: ls.coverKey || null,
        previewThumbUrl: null,    // fill via your media helper if you have one
        durationSecs: ls.durationSec ?? null,

        isLive: ls.status === 'live' || !!ls.isActive,
        startedAt: ls.startedAt || null,
        endedAt: ls.endedAt || null,

        type: 'liveStream',
        visibility: ls.visibility || 'public',
        isPosted: !!ls.isPosted || !!ls.savedToProfile,
        postId: ls.sharedPostId || null,
        likes: ls.likes || [],
        comments: ls.comments || [],
        taggedUsers: [],
      };
    });

    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    return items;
  } catch (error) {
    console.error('❌ Error in getUserAndFollowingLiveStreams:', error);
    throw new Error('Failed to fetch user and following live streams');
  }
};

module.exports = { getPostedLiveStreams };
