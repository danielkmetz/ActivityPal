// utils/enrichStories.js
const { getPresignedUrl } = require('./cachePresignedUrl'); // or wherever yours lives
const User = require('../models/User');

const DEBUG_STORIES = process.env.DEBUG_STORIES === '1';
const DEBUG_HTTP = process.env.DEBUG_STORIES_HTTP_HEAD === '1'; // optional: do HTTP HEAD probes

function maskUrl(u) {
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}?<sig>`;
  } catch {
    return (u || '').split('?')[0] + '?<sig>';
  }
}
function log(...args) {
  if (DEBUG_STORIES) console.log('[enrichStory]', ...args);
}

async function headProbe(url) {
  if (!DEBUG_HTTP || typeof fetch !== 'function') return null;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const headers = Object.fromEntries([...head.headers.entries()]);
    let rangeInfo = null;
    try {
      const range = await fetch(url, { headers: { Range: 'bytes=0-0' } });
      rangeInfo = {
        status: range.status,
        contentRange: range.headers.get('content-range'),
        contentType: range.headers.get('content-type'),
      };
    } catch (e) {
      rangeInfo = { error: String(e) };
    }
    return {
      status: head.status,
      ok: head.ok,
      contentType: headers['content-type'],
      contentLength: headers['content-length'],
      acceptRanges: headers['accept-ranges'],
      rangeProbe: rangeInfo,
    };
  } catch (e) {
    return { error: String(e) };
  }
}

const enrichStory = async (story, uploaderUser, currentUserId = null, originalOwner = null) => {
  const storyObj = story?.toObject ? story.toObject() : story;
  const rawUploader = uploaderUser?.toObject ? uploaderUser.toObject() : uploaderUser;

  const storyId = storyObj?._id?.toString?.() || '(no-id)';
  const mediaKey = storyObj?.mediaKey || null;

  // --- media
  let mediaUrl = null;
  if (mediaKey) {
    const t0 = Date.now();
    try {
      log(`presign mediaKey="${mediaKey}" storyId=${storyId}`);
      mediaUrl = await getPresignedUrl(mediaKey);
      const took = Date.now() - t0;
      log(`presign OK in ${took}ms url=${maskUrl(mediaUrl)}`);

      const probe = await headProbe(mediaUrl);
      if (probe) log('HEAD probe', {
        url: maskUrl(mediaUrl),
        status: probe.status,
        ok: probe.ok,
        contentType: probe.contentType,
        contentLength: probe.contentLength,
        acceptRanges: probe.acceptRanges,
        rangeProbe: probe.rangeProbe,
      });
    } catch (e) {
      log(`presign FAILED mediaKey="${mediaKey}"`, e?.name || '', e?.message || String(e));
    }
  } else {
    log('no mediaKey on story', { storyId });
  }

  // --- uploader (shape as OriginalOwner union)
  const uploaderIsBusiness = !!(rawUploader?.businessName || rawUploader?.placeId);
  const uploaderId = rawUploader?._id?.toString?.() || rawUploader?.id || null;

  const getOptionalPresign = async (label, key) => {
    if (!key) return null;
    const t0 = Date.now();
    try {
      log(`presign ${label} key="${key}" storyId=${storyId}`);
      const url = await getPresignedUrl(key);
      const took = Date.now() - t0;
      log(`presign ${label} OK in ${took}ms url=${maskUrl(url)}`);
      return url;
    } catch (e) {
      log(`presign ${label} FAILED key="${key}"`, e?.name || '', e?.message || String(e));
      return null;
    }
  };

  const uploaderProfilePicUrl = await getOptionalPresign('uploader.profilePic', rawUploader?.profilePic?.photoKey);
  const uploaderLogoUrl = await getOptionalPresign('uploader.logo', rawUploader?.logoKey);

  const uploader = uploaderIsBusiness
    ? {
        __typename: 'Business',
        id: uploaderId,
        businessName: rawUploader?.businessName || null,
        placeId: rawUploader?.placeId || null,
        logoUrl: uploaderLogoUrl,
      }
    : {
        __typename: 'User',
        id: uploaderId,
        firstName: rawUploader?.firstName || null,
        lastName: rawUploader?.lastName || null,
        profilePicUrl: uploaderProfilePicUrl,
      };

  // --- viewedBy
  let viewedBy = [];
  if (Array.isArray(storyObj.viewedBy) && storyObj.viewedBy.length > 0) {
    const viewerUsers = await User.find({ _id: { $in: storyObj.viewedBy } })
      .select('_id firstName lastName profilePic')
      .lean();

    viewedBy = await Promise.all(
      viewerUsers.map(async (viewer) => {
        const picKey = viewer?.profilePic?.photoKey;
        const viewerPicUrl = picKey ? await getOptionalPresign('viewer.profilePic', picKey) : null;
        return {
          __typename: 'User',
          id: viewer._id.toString(),
          firstName: viewer.firstName || null,
          lastName: viewer.lastName || null,
          profilePicUrl: viewerPicUrl,
        };
      })
    );
  }

  const isViewed = !!(
    currentUserId &&
    Array.isArray(storyObj.viewedBy) &&
    storyObj.viewedBy.some((id) => id?.toString?.() === currentUserId?.toString?.())
  );

  // --- originalOwner (optional)
  let typedOriginalOwner = null;
  const storyReferencesOriginalOwner = !!(storyObj?.originalOwner || storyObj?.originalOwnerModel);

  if (storyReferencesOriginalOwner) {
    if (originalOwner && typeof originalOwner === 'object') {
      const isBiz = !!originalOwner.businessName;
      const ownerId = originalOwner._id?.toString?.() || originalOwner.id;

      if (isBiz) {
        const logoUrl =
          originalOwner.logoKey
            ? await getOptionalPresign('originalOwner.logo', originalOwner.logoKey)
            : (originalOwner.logoUrl || null);

        typedOriginalOwner = {
          __typename: 'Business',
          id: ownerId,
          businessName: originalOwner.businessName || null,
          logoUrl,
        };
      } else {
        const ppUrl =
          originalOwner.profilePicUrl ||
          (originalOwner.profilePic?.photoKey
            ? await getOptionalPresign('originalOwner.profilePic', originalOwner.profilePic.photoKey)
            : null);

        typedOriginalOwner = {
          __typename: 'User',
          id: ownerId,
          firstName: originalOwner.firstName || null,
          lastName: originalOwner.lastName || null,
          profilePicUrl: ppUrl,
        };
      }

      if (!typedOriginalOwner?.id) {
        console.error(`❌ [enrichStory] Missing required "id" for story ${storyId} originalOwner:`, originalOwner);
      }
      if (!typedOriginalOwner?.__typename) {
        console.error(`❌ [enrichStory] Missing __typename for story ${storyId} originalOwner:`, originalOwner);
      }
    } else {
      console.warn('⚠️ [enrichStory] story references originalOwner, but helper received none or non-object:', {
        storyId,
        originalOwnerReceived: originalOwner,
      });
    }
  }

  const enriched = {
    ...storyObj,
    mediaUrl,
    viewedBy,
    isViewed,
    user: uploader,
    _originalOwner: typedOriginalOwner,
  };

  return enriched;
};

module.exports = { enrichStory };
