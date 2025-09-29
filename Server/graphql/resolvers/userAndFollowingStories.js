// resolvers/userAndFollowingStories.js
const User = require('../../models/User');
const Business = require('../../models/Business');
const { enrichStory } = require('../../utils/enrichStories');
const { enrichSharedPost, resolveUserProfilePics } = require('../../utils/userPosts');
const { resolveSharedPostData } = require('../../utils/resolveSharedPostType');

const DEBUG_STORIES = process.env.DEBUG_STORIES === '1';
const DEBUG_HTTP = process.env.DEBUG_STORIES_HTTP_HEAD === '1';
const PROBE_LIMIT = Number(process.env.DEBUG_STORIES_PROBE_LIMIT || 5);

function log(...args) {
  if (DEBUG_STORIES) console.log('[userAndFollowingStories]', ...args);
}
function short(id) {
  const s = String(id || '');
  return s.length > 10 ? s.slice(0, 8) + '…' : s;
}
function maskUrl(u) {
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}?<sig>`;
  } catch {
    return (u || '').split('?')[0] + '?<sig>';
  }
}
function guessKeyFromUrl(u) {
  try {
    const url = new URL(u);
    // works for both virtual-hosted and path-style S3 URLs
    return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  } catch {
    return null;
  }
}
async function headProbe(url) {
  if (!DEBUG_HTTP || !url) return null;

  // obtain fetch (Node 18+ has global fetch; otherwise try node-fetch)
  let _fetch = global.fetch;
  if (!_fetch) {
    try {
      // eslint-disable-next-line global-require
      _fetch = require('node-fetch');
    } catch {
      log('⚠️ No fetch available (Node < 18 and node-fetch not installed). Skipping HEAD probe.');
      return null;
    }
  }

  try {
    const head = await _fetch(url, { method: 'HEAD' });
    const headers = Object.fromEntries([...head.headers.entries()]);
    let rangeResult = null;
    try {
      const r = await _fetch(url, { headers: { Range: 'bytes=0-0' } });
      rangeResult = {
        status: r.status,
        contentRange: r.headers.get('content-range'),
        contentType: r.headers.get('content-type'),
      };
    } catch (e) {
      rangeResult = { error: String(e) };
    }
    return {
      status: head.status,
      ok: head.ok,
      contentType: headers['content-type'],
      contentLength: headers['content-length'],
      acceptRanges: headers['accept-ranges'],
      rangeProbe: rangeResult,
    };
  } catch (e) {
    return { error: String(e) };
  }
}

const userAndFollowingStories = async (_, { userId }, context) => {
  const rid = Date.now().toString(36);
  const t0 = Date.now();
  log(`▶️ start rid=${rid} userId=${userId} currentUser=${short(context?.user?._id || userId)}`);

  try {
    const currentUserId = context?.user?._id || userId;

    const user = await User.findById(userId)
      .select('firstName lastName profilePic stories following')
      .populate({
        path: 'following',
        select: 'firstName lastName profilePic stories',
      });

    if (!user) {
      log('❌ User not found:', userId);
      throw new Error('User not found');
    }

    const now = new Date();
    const usersToCheck = [user, ...(user.following || [])];
    log(`👥 users to check: ${usersToCheck.length}`);

    // Collect originalOwner IDs
    const userIdsToResolve = new Set();
    const userOwnerIds = new Set();
    const businessOwnerIds = new Set();

    for (const u of usersToCheck) {
      userIdsToResolve.add(u._id.toString());
      for (const story of u.stories || []) {
        const valid = new Date(story.expiresAt) > now && story.visibility === 'public';
        if (!valid) continue;
        if (story.originalOwner) {
          userIdsToResolve.add(story.originalOwner.toString());
          if (story.originalOwnerModel === 'Business') businessOwnerIds.add(story.originalOwner.toString());
          else userOwnerIds.add(story.originalOwner.toString());
        }
      }
    }

    log('📸 resolving profile pics for', [...userIdsToResolve].map(short));
    const profilePicMap = await resolveUserProfilePics([...userIdsToResolve]).catch((e) => {
      log('⚠️ resolveUserProfilePics failed:', e?.message || e);
      return {};
    });
    log('✅ profile pics resolved');

    const [userDocs, businessDocs] = await Promise.all([
      User.find({ _id: { $in: [...userOwnerIds] } })
        .select('firstName lastName profilePic profilePicUrl')
        .lean(),
      Business.find({ _id: { $in: [...businessOwnerIds] } })
        .select('businessName logoKey profilePic profilePicUrl')
        .lean(),
    ]);

    const originalOwnerMap = new Map();
    for (const userDoc of userDocs) originalOwnerMap.set(userDoc._id.toString(), { ...userDoc, __model: 'User' });
    for (const bizDoc of businessDocs) originalOwnerMap.set(bizDoc._id.toString(), { ...bizDoc, __model: 'Business' });

    const groupedStoriesMap = new Map();
    let probes = 0;

    for (const u of usersToCheck) {
      const uploaderId = u._id.toString();
      const uploaderProfile = profilePicMap[uploaderId] || {};
      const userInfo = {
        id: uploaderId,
        firstName: u.firstName,
        lastName: u.lastName,
        profilePicUrl: uploaderProfile.profilePicUrl || null,
      };

      for (const story of u.stories || []) {
        const valid = new Date(story.expiresAt) > now && story.visibility === 'public';
        if (!valid) continue;

        const isSharedPost = story.originalPostId && story.postType;
        const originalOwnerId = story.originalOwner?.toString();
        const originalOwner = originalOwnerMap.get(originalOwnerId) || null;

        let enrichedStory;
        const sid = short(story?._id);

        if (isSharedPost) {
          log(`🔗 shared story id=${sid} postType=${story.postType} originalPostId=${short(story.originalPostId)}`);
          const { original } = await resolveSharedPostData(story.postType, story.originalPostId);
          if (!original || !original._id) {
            log(`⚠️ skip story id=${sid}, missing original post ${story.originalPostId}`);
            continue;
          }
          const normalizedStory = {
            _id: story._id.toString?.() || story._id,
            mediaKey: story.mediaKey,
            mediaType: story.mediaType,
            caption: story.caption,
            visibility: story.visibility,
            expiresAt: story.expiresAt,
            viewedBy: story.viewedBy,
            originalPostId: story.originalPostId?.toString?.() || story.originalPostId,
            postType: story.postType,
            originalOwner: story.originalOwner?.toString?.() || story.originalOwner,
            originalOwnerModel: story.originalOwnerModel,
          };

          const enrichedSharedStory = await enrichSharedPost(
            { ...normalizedStory, original, user: u, storyMeta: normalizedStory },
            profilePicMap,
            null,
            currentUserId
          );
          const baseEnriched = await enrichStory(story, u, currentUserId, originalOwner);

          enrichedStory = {
            ...enrichedSharedStory,
            ...baseEnriched,
            _id: story._id,
            type: 'sharedStory',
            original: enrichedSharedStory.original,
          };
        } else {
          log(`📝 regular story id=${sid} mediaKey=${story.mediaKey}`);
          enrichedStory = await enrichStory(story, u, currentUserId, originalOwner);
          enrichedStory = { ...enrichedStory, type: 'story' };
        }

        // 🔍 Optional S3 health check for VIDEO stories (limited by PROBE_LIMIT)
        if (
          DEBUG_HTTP &&
          probes < PROBE_LIMIT &&
          enrichedStory?.mediaUrl &&
          (enrichedStory?.mediaType === 'video' || /\.mp4($|\?)/i.test(enrichedStory.mediaUrl))
        ) {
          probes += 1;
          const masked = maskUrl(enrichedStory.mediaUrl);
          const keyGuess = guessKeyFromUrl(enrichedStory.mediaUrl);
          const tProbe = Date.now();
          const probe = await headProbe(enrichedStory.mediaUrl);
          log('🧪 media HEAD', {
            story: sid,
            url: masked,
            keyGuess,
            tookMs: Date.now() - tProbe,
            result: probe,
          });
        }

        if (!groupedStoriesMap.has(uploaderId)) {
          groupedStoriesMap.set(uploaderId, {
            _id: uploaderId,
            user: userInfo,
            profilePicUrl: userInfo.profilePicUrl,
            stories: [],
          });
        }
        groupedStoriesMap.get(uploaderId).stories.push(enrichedStory);
      }
    }

    const result = Array.from(groupedStoriesMap.values());
    log(`✅ done rid=${rid} groups=${result.length} totalMs=${Date.now() - t0}`);
    return result;
  } catch (err) {
    log(`❌ error rid=${rid} ${err?.name || ''}: ${err?.message || err}`);
    console.error('🔥 Error in userAndFollowingStories resolver:', err);
    throw new Error('Failed to fetch stories');
  }
};

module.exports = { userAndFollowingStories };
