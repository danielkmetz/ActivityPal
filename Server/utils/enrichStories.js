const { getPresignedUrl } = require('./cachePresignedUrl'); // or wherever yours lives
const User = require('../models/User');

const DEBUG_STORIES = process.env.DEBUG_STORIES === '1';
const DEBUG_HTTP = process.env.DEBUG_STORIES_HTTP_HEAD === '1'; // kept for compat; now uses GET Range

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

// ---- Probe helper: ONLY uses GET Range so presigned GET works ----
async function rangeProbe(url) {
  if (!DEBUG_HTTP || !url) return null;

  let _fetch = typeof fetch === 'function' ? fetch : null;
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
    // Ask for a single byte to verify the object & content-type without downloading the file
    const r = await _fetch(url, { headers: { Range: 'bytes=0-0' } });
    return {
      status: r.status,                    // expect 206
      ok: r.ok,
      contentType: r.headers.get('content-type'),
      contentRange: r.headers.get('content-range'), // e.g. "bytes 0-0/10337290"
      acceptRanges: r.headers.get('accept-ranges'), // often "bytes"
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
      // ⚠️ Do not append client-side query params to presigned URLs (breaks signature)
      mediaUrl = await getPresignedUrl(mediaKey);
      const took = Date.now() - t0;
      log(`presign OK in ${took}ms url=${maskUrl(mediaUrl)}`);

      const probe = await rangeProbe(mediaUrl);
      if (probe) {
        log('PROBE', {
          url: maskUrl(mediaUrl),
          status: probe.status,
          ok: probe.ok,
          contentType: probe.contentType,
          contentRange: probe.contentRange,
          acceptRanges: probe.acceptRanges,
        });
      }
    } catch (e) {
      log(`presign FAILED mediaKey="${mediaKey}"`, e?.name || '', e?.message || String(e));
    }
  } else {
    log('no mediaKey on story', { storyId });
  }

  // --- uploader (shape as union)
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

  // --- viewedBy enrichment
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
    mediaUrl,     // use as-is; do not mutate the presigned query string
    viewedBy,
    isViewed,
    user: uploader,
    _originalOwner: typedOriginalOwner,
  };

  return enriched;
};

module.exports = { enrichStory };
