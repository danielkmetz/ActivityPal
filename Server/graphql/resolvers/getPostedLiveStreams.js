const mongoose = require('mongoose');
const User = require('../../models/User');
const LiveStream = require('../../models/LiveStream');
const { resolveUserProfilePics } = require('../../utils/userPosts');

const getPostedLiveStreams = async (_parent, { userId, excludeAuthorIds = [] }) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('Invalid userId format');
    }

    const viewerId = new mongoose.Types.ObjectId(userId);

    // Load viewer to get following
    const viewer = await User.findById(viewerId).select('following').lean();
    if (!viewer) throw new Error('User not found');

    // Candidate hosts (me + following) -> strings
    const followingStr = (viewer.following || []).map(String);
    const candidateHostIdsStr = [String(viewerId), ...followingStr];

    // Push-down block filter
    const excludeSet = new Set((excludeAuthorIds || []).map(String));
    const allowedHostIdsStr = Array.from(
      new Set(candidateHostIdsStr.filter(id => !excludeSet.has(id)))
    );

    // Nothing left? Early return
    if (allowedHostIdsStr.length === 0) return [];

    // Back to ObjectIds for queries
    const allowedHostIds = allowedHostIdsStr.map(id => new mongoose.Types.ObjectId(id));

    // Profile pics for allowed hosts only
    const profilePicMap = await resolveUserProfilePics(allowedHostIds);

    // Names for allowed hosts only
    const userDocs = await User.find({ _id: { $in: allowedHostIds } })
      .select('_id firstName lastName')
      .lean();

    const usersById = {};
    for (const u of userDocs) {
      usersById[String(u._id)] = {
        fullName: [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
      };
    }

    // Query only allowed hosts (push-down) + posted
    const lives = await LiveStream.find({
      hostUserId: { $in: allowedHostIds },
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
        fullName: nameMeta.fullName || null,
        profilePic: picMeta.profilePic ?? null,
        profilePicUrl: picMeta.profilePicUrl ?? null,
        caption: ls.caption ?? null,
        date,
        playbackUrl: ls.playbackUrl || null,
        vodUrl: ls.recording?.vodUrl || null,
        coverKey: ls.coverKey || null,
        previewThumbUrl: null, // populate via media helper if desired
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
