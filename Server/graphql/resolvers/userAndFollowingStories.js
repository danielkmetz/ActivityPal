const User = require('../../models/User');
const Business = require('../../models/Business');
const { Post } = require('../../models/Post'); // ✅ unified Post model
const { enrichStory } = require('../../utils/enrichStories');
const { enrichSharedPost, resolveUserProfilePics } = require('../../utils/userPosts'); // enrichSharedPost already updated to unified Post

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
    return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  } catch {
    return null;
  }
}

async function rangeProbe(url) {
  if (!DEBUG_HTTP || !url) return null;

  let _fetch = global.fetch;
  if (!_fetch) {
    try {
      // eslint-disable-next-line global-require
      _fetch = require('node-fetch');
    } catch {
      log('⚠️ No fetch available (Node < 18 and node-fetch not installed). Skipping probe.');
      return null;
    }
  }

  try {
    const r = await _fetch(url, { headers: { Range: 'bytes=0-0' } });
    return {
      status: r.status,
      ok: r.ok,
      contentType: r.headers.get('content-type'),
      contentRange: r.headers.get('content-range'),
      acceptRanges: r.headers.get('accept-ranges'),
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

    // Pull current user + following with their stories
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

    // -------------------- Batch collect ids for one-shot queries --------------------
    const uploaderIds = new Set();
    const originalPostIds = new Set();

    for (const u of usersToCheck) {
      uploaderIds.add(u._id.toString());
      for (const story of u.stories || []) {
        const valid = new Date(story.expiresAt) > now && story.visibility === 'public';
        if (!valid) continue;
        if (story.originalPostId) {
          originalPostIds.add(story.originalPostId.toString());
        }
      }
    }

    // Load all originals at once from unified Post collection
    const originalPosts = originalPostIds.size
      ? await Post.find({ _id: { $in: [...originalPostIds] } }).lean()
      : [];
    const originalPostMap = new Map(originalPosts.map((p) => [p._id.toString(), p]));

    // Collect owner ids from originals (by model) for later lookups + pics
    const ownerUserIds = new Set();
    const ownerBusinessIds = new Set();

    for (const p of originalPosts) {
      if (p.ownerModel === 'Business' && p.ownerId) {
        ownerBusinessIds.add(p.ownerId.toString());
      } else if (p.ownerId) {
        ownerUserIds.add(p.ownerId.toString());
      }
    }

    // Resolve profile pics for uploaders + owners (users/businesses)
    const picIds = new Set([...uploaderIds, ...ownerUserIds, ...ownerBusinessIds]);
    log('📸 resolving profile pics for', [...picIds].map(short));
    const profilePicMap = await resolveUserProfilePics([...picIds]).catch((e) => {
      log('⚠️ resolveUserProfilePics failed:', e?.message || e);
      return {};
    });
    log('✅ profile pics resolved');

    // Load owner docs in batch (only if needed)
    const [ownerUsers, ownerBusinesses] = await Promise.all([
      ownerUserIds.size
        ? User.find({ _id: { $in: [...ownerUserIds] } })
            .select('firstName lastName profilePic profilePicUrl')
            .lean()
        : [],
      ownerBusinessIds.size
        ? Business.find({ _id: { $in: [...ownerBusinessIds] } })
            .select('businessName logoKey profilePic profilePicUrl')
            .lean()
        : [],
    ]);

    const originalOwnerMap = new Map();
    for (const udoc of ownerUsers) {
      originalOwnerMap.set(udoc._id.toString(), { ...udoc, __model: 'User' });
    }
    for (const bdoc of ownerBusinesses) {
      originalOwnerMap.set(bdoc._id.toString(), { ...bdoc, __model: 'Business' });
    }

    // -------------------- Build grouped response --------------------
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

        const hasOriginal = !!story.originalPostId;
        let enrichedStory;
        const sid = short(story?._id);

        if (hasOriginal) {
          const original = originalPostMap.get(story.originalPostId.toString());
          if (!original) {
            log(`⚠️ skip story id=${sid}, missing original post ${short(story.originalPostId)}`);
            continue;
          }

          // Owner doc for original
          const ownerIdStr = original.ownerId?.toString?.() || String(original.ownerId || '');
          const originalOwner =
            originalOwnerMap.get(ownerIdStr) ||
            null;

          // Normalize story meta for enrichSharedPost
          const normalizedStory = {
            _id: story._id.toString?.() || story._id,
            mediaKey: story.mediaKey,
            mediaType: story.mediaType,
            caption: story.caption,
            visibility: story.visibility,
            expiresAt: story.expiresAt,
            viewedBy: story.viewedBy,
            originalPostId: original._id?.toString?.() || original._id,
            postType: original.type, // ✅ prefer the unified post.type
            originalOwner: original.ownerId?.toString?.() || original.ownerId,
            originalOwnerModel: original.ownerModel,
          };

          // enrichSharedPost now expects unified Post in `original`
          const enrichedSharedStory = await enrichSharedPost(
            {
              ...normalizedStory,
              original,
              user: u,
              storyMeta: normalizedStory,
            },
            profilePicMap // userLat/userLng not used here
          );

          const baseEnriched = await enrichStory(story, u, currentUserId, originalOwner);

          enrichedStory = {
            ...enrichedSharedStory,
            ...baseEnriched,
            _id: story._id,
            type: 'sharedStory',
            original: enrichedSharedStory?.original,
          };
        } else {
          log(`📝 regular story id=${sid} mediaKey=${story.mediaKey}`);
          enrichedStory = await enrichStory(story, u, currentUserId, null);
          enrichedStory = { ...enrichedStory, type: 'story' };
        }

        // Optional S3 health probe for videos
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
          const probe = await rangeProbe(enrichedStory.mediaUrl);
          log('🧪 media PROBE', {
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

    // Robust ms coercion
    const toMs = (v) => {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'string') return Date.parse(v) || 0;
      return v?.getTimestamp?.().getTime?.() || 0;
    };

    // Sort each user's stories newest → oldest
    for (const g of result) {
      g.stories.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
      g._latestMs = g.stories.length ? toMs(g.stories[0].createdAt) : 0;
    }

    // Sort users by most recent story
    result.sort((a, b) => (b._latestMs || 0) - (a._latestMs || 0));
    for (const g of result) delete g._latestMs;

    log(`✅ done rid=${rid} groups=${result.length} totalMs=${Date.now() - t0}`);
    return result;
  } catch (err) {
    log(`❌ error rid=${rid} ${err?.name || ''}: ${err?.message || err}`);
    console.error('🔥 Error in userAndFollowingStories resolver:', err);
    throw new Error('Failed to fetch stories');
  }
};

module.exports = { userAndFollowingStories };
