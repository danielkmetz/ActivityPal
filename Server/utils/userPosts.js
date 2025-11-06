const User = require('../models/User');
const Business = require('../models/Business');
const { Post } = require('../models/Post'); // ⬅️ unified Post model
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const haversineDistance = require('../utils/haversineDistance.js');
const {
  toInviteUserShape,
  toInviteRecipientsShape,
  lookupBusinessBits,
} = require('./invites/enrichInviteBits.js');
const { enrichOriginalOwner } = require('./stories/enrichOriginalOwner.js');
const { shapeStoryUploader } = require('./stories/shapeStoryUploader.js');

/* ----------------------------- Comments/media ----------------------------- */

async function enrichCommentMedia(media) {
  if (!media || !media.photoKey) return null;
  const url = await getPresignedUrl(media.photoKey);
  return { photoKey: media.photoKey, mediaType: media.mediaType, url };
}

async function enrichReplies(replies = []) {
  return Promise.all(
    replies.map(async (reply) => {
      const enrichedMedia = await enrichCommentMedia(reply.media);
      const nestedReplies = await enrichReplies(reply.replies || []);
      return {
        ...reply,
        _id: reply._id?.toString?.() || reply._id,
        userId: reply.userId,
        fullName: reply.fullName,
        commentText: reply.commentText,
        media: enrichedMedia,
        replies: nestedReplies,
      };
    })
  );
}

async function enrichComments(comments = []) {
  return Promise.all(
    comments.map(async (comment) => {
      const enrichedMedia = await enrichCommentMedia(comment.media);
      const enrichedReplies = await enrichReplies(comment.replies || []);
      return {
        ...comment,
        _id: comment._id?.toString?.() || comment._id,
        userId: comment.userId,
        fullName: comment.fullName,
        commentText: comment.commentText,
        media: enrichedMedia,
        replies: enrichedReplies,
      };
    })
  );
}

/* -------------------------- Tagged users / media -------------------------- */

async function resolveTaggedUsers(taggedUserIds = []) {
  if (!Array.isArray(taggedUserIds) || taggedUserIds.length === 0) return [];
  const ids = taggedUserIds.map((id) => id?.toString()).filter(Boolean);
  const users = await User.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1 });
  return users.map((u) => ({
    userId: u._id,
    fullName: `${u.firstName} ${u.lastName}`,
  }));
}

async function resolveTaggedPhotoUsers(photos = []) {
  if (!Array.isArray(photos) || photos.length === 0) return [];

  const cleanPhotos = photos.map((p) => p.toObject?.() || p).filter((p) => p?.photoKey);

  const allTaggedIds = new Set();
  for (const photo of cleanPhotos) {
    (photo.taggedUsers || []).forEach((tag) => {
      const raw = tag?.userId;
      const id =
        (raw && raw._id?.toString?.()) ||
        (raw && raw.toString?.()) ||
        (typeof raw === 'string' ? raw : null);
      if (id) allTaggedIds.add(id);
    });
  }
  const taggedUserArray = [...allTaggedIds];

  const [users, profilePicMap, urlMap] = await Promise.all([
    taggedUserArray.length
      ? User.find({ _id: { $in: taggedUserArray } }, { firstName: 1, lastName: 1 })
      : [],
    taggedUserArray.length ? resolveUserProfilePics(taggedUserArray) : {},
    (async () => {
      const map = {};
      await Promise.all(
        cleanPhotos.map(async (p) => {
          map[p.photoKey] = await getPresignedUrl(p.photoKey);
        })
      );
      return map;
    })(),
  ]);

  const nameMap = {};
  for (const u of users) {
    nameMap[u._id.toString()] =
      `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown User';
  }

  return cleanPhotos.map((photo) => {
    const enrichedTags = (photo.taggedUsers || []).map((tag) => {
      const raw = tag?.userId;
      const id =
        (raw && raw._id?.toString?.()) ||
        (raw && raw.toString?.()) ||
        (typeof raw === 'string' ? raw : null);
      const profile = id ? profilePicMap[id] : null;

      return {
        userId: tag.userId,
        fullName: (id && nameMap[id]) || 'Unknown User',
        profilePicUrl: profile?.profilePicUrl || null,
        x: tag.x || 0,
        y: tag.y || 0,
      };
    });

    return {
      ...photo,
      url: urlMap[photo.photoKey],
      taggedUsers: enrichedTags,
    };
  });
}

async function resolveUserProfilePics(userIds) {
  const result = {};

  const users = await User.find({ _id: { $in: userIds } })
    .select('_id profilePic')
    .lean();

  const foundUserIds = new Set(users.map((u) => u._id.toString()));

  for (const user of users) {
    let presignedUrl = null;
    if (user.profilePic?.photoKey) {
      try {
        presignedUrl = await getPresignedUrl(user.profilePic.photoKey);
      } catch (err) {
        console.warn(`⚠️ Failed to get presigned URL for user ${user._id}:`, err.message);
      }
    }
    result[user._id.toString()] = {
      _id: user._id,
      id: user._id.toString(),
      profilePic: user.profilePic || null,
      profilePicUrl: presignedUrl,
    };
  }

  const remainingIds = userIds.filter((id) => !foundUserIds.has(id.toString()));
  if (remainingIds.length === 0) return result;

  const businesses = await Business.find({ _id: { $in: remainingIds } })
    .select('_id logoKey')
    .lean();

  for (const business of businesses) {
    let presignedUrl = null;
    if (business.logoKey) {
      try {
        presignedUrl = await getPresignedUrl(business.logoKey);
      } catch (err) {
        console.warn(
          `⚠️ Failed to get presigned URL for business ${business._id}:`,
          err.message
        );
      }
    }
    result[business._id.toString()] = {
      _id: business._id,
      id: business._id.toString(),
      profilePic: business.logoKey || null,
      profilePicUrl: presignedUrl,
    };
  }

  return result;
}

/* --------------------------- Gather user posts --------------------------- */

async function gatherUserReviews(userObjectId, profilePic, profilePicUrl) {
  try {
    const [reviews, author] = await Promise.all([
      Post.find({
        type: 'review',
        ownerId: userObjectId,
        visibility: { $ne: 'deleted' },
      }).lean(),
      User.findById(userObjectId).select('firstName lastName').lean(),
    ]);

    const authorName = author
      ? `${author.firstName || ''} ${author.lastName || ''}`.trim()
      : null;

    const enriched = await Promise.all(
      reviews.map(async (review) => {
        try {
          const [taggedUsers, rawMedia, business, comments] = await Promise.all([
            resolveTaggedUsers(review.taggedUsers || []),
            resolveTaggedPhotoUsers(review.media || []),
            Business.findOne({ placeId: review.placeId })
              .select('businessName')
              .lean(),
            enrichComments(review.comments || []),
          ]);

          const media = (rawMedia || []).filter((m) => m && m.photoKey);
          return {
            __typename: 'Review',
            ...review,
            fullName: authorName,
            businessName: business?.businessName || null,
            placeId: review.placeId || null,
            date: review.createdAt ? new Date(review.createdAt).toISOString() : null,
            profilePic: profilePic || null,
            profilePicUrl: profilePicUrl || null,
            taggedUsers,
            photos: media, // keep legacy key
            media,
            comments,
            type: 'review',
          };
        } catch {
          return null;
        }
      })
    );

    return enriched.filter((r) => r !== null);
  } catch {
    return [];
  }
}

async function gatherUserCheckIns(user, profilePicUrl) {
  const userIdStr = user?._id?.toString?.() || String(user?._id || '');

  try {
    const checkIns = await Post.find({
      type: 'check-in',
      ownerId: userIdStr,
      visibility: { $ne: 'deleted' },
    }).lean();

    const enriched = await Promise.all(
      checkIns.map(async (checkIn) => {
        try {
          const [taggedUsers, rawMedia, business, comments] = await Promise.all([
            resolveTaggedUsers(checkIn.taggedUsers || []),
            resolveTaggedPhotoUsers(checkIn.media || []),
            Business.findOne({ placeId: (checkIn.placeId || '').trim() })
              .select('businessName placeId')
              .lean(),
            enrichComments(checkIn.comments || []),
          ]);

          const media = (rawMedia || []).filter((m) => m && m.photoKey);

          return {
            __typename: 'CheckIn',
            _id: checkIn._id,
            userId: user._id,
            fullName: `${user.firstName} ${user.lastName}`,
            message: checkIn.message || '',
            date: checkIn.details?.date
              ? new Date(checkIn.details.date).toISOString()
              : checkIn.createdAt
              ? new Date(checkIn.createdAt).toISOString()
              : null,
            profilePic: user.profilePic || null,
            profilePicUrl,
            placeId: checkIn.placeId || null,
            businessName: business?.businessName || 'Unknown Business',
            taggedUsers,
            photos: media, // keep legacy key
            media,
            likes: checkIn.likes || [],
            comments,
            distance: null,
            type: 'check-in',
          };
        } catch {
          return null;
        }
      })
    );

    return enriched.filter(Boolean);
  } catch {
    return [];
  }
}

/* ----------------------------- Shared content ---------------------------- */

async function enrichSharedPost(shared, profilePicMap = {}, userLat = null, userLng = null) {
  try {
    const {
      postType, // may be provided by caller; prefer original.type once loaded
      originalPostId,
      original: providedOriginal,
      originalOwner, // ObjectId or {_id}
      originalOwnerModel, // 'User' | 'Business'
      user,
      storyMeta = {},
    } = shared;

    // --- Normalize "original" from unified Post
    let original = providedOriginal;
    if (!original) {
      original = await Post.findById(originalPostId).lean();
    } else if (typeof original.toObject === 'function') {
      original = original.toObject();
    }
    if (!original || !original._id) {
      console.warn(
        `[❌ MISSING ORIGINAL DOC] originalPostId: ${originalPostId}, sharedId: ${shared._id}`
      );
      return null;
    }

    const effectiveType = original.type || postType;
    original._id = original._id.toString?.() || original._id;
    if (original.ownerId?.toString) original.ownerId = original.ownerId.toString();

    // pull profile for owner (user or business)
    const ownerIdStr = original.ownerId?.toString?.() || original.ownerId;
    const profile = ownerIdStr ? profilePicMap[ownerIdStr] : null;
    const profilePic = profile?.profilePic?.photoKey ? profile.profilePic : null;
    const profilePicUrl = profile?.profilePicUrl || null;

    // business bits
    let business = null;
    if (['review', 'check-in', 'promotion', 'event', 'invite'].includes(effectiveType)) {
      if (original.placeId) {
        business = await Business.findOne({ placeId: original.placeId })
          .select('businessName logoKey bannerKey location')
          .lean();
      }
    }

    // comments
    const comments = await enrichComments(original.comments || []);

    // ----------------- Non-invite types (review/check-in/event/promo) -----------------
    if (['review', 'check-in', 'promotion', 'event'].includes(effectiveType)) {
      const taggedUsers = await resolveTaggedUsers(original.taggedUsers || []);
      const rawMedia = await resolveTaggedPhotoUsers(original.media || []);

      let distance = null;
      if (
        ['event', 'promotion'].includes(effectiveType) &&
        userLat != null &&
        userLng != null &&
        business?.location?.coordinates?.length === 2
      ) {
        const [bizLng, bizLat] = business.location.coordinates;
        if (!isNaN(bizLat) && !isNaN(bizLng)) {
          distance = haversineDistance(userLat, userLng, bizLat, bizLng);
        }
      }

      const baseOriginal = {
        __typename: capitalizeFirstLetter(effectiveType), // Review | CheckIn | Promotion | Event
        _id: original._id,
        ...original,
        businessName: business?.businessName || null,
        businessLogoUrl: business?.logoKey ? await getPresignedUrl(business.logoKey) : null,
        type: effectiveType,
        profilePic,
        profilePicUrl,
        taggedUsers,
        photos: rawMedia.filter((p) => p && p.photoKey),
        media: rawMedia.filter((p) => p && p.photoKey),
        comments,
        date:
          original.details?.date ||
          original.createdAt ||
          new Date(), // ISO below
      };

      baseOriginal.date = new Date(baseOriginal.date).toISOString();

      if (['event', 'promotion'].includes(effectiveType)) {
        Object.assign(baseOriginal, {
          distance,
          formattedAddress: business?.location?.formattedAddress || null,
          recurringDays: original.details?.recurringDays || [],
          startTime:
            original.details?.startsAt || original.startTime || null,
          endTime: original.details?.endsAt || original.endTime || null,
          allDay: original.allDay || false,
          createdAt: original.createdAt || null,
          title: original.title || null,
        });

        // fallback banner/logo if no media
        const hasMedia =
          Array.isArray(baseOriginal.media) && baseOriginal.media.length > 0;
        if (!hasMedia && (business?.bannerKey || business?.logoKey)) {
          const key = business.bannerKey || business.logoKey;
          const url = await getPresignedUrl(key);
          const fallbackPhoto = {
            photoKey: key,
            uploadedBy: business._id,
            description: 'Business banner',
            taggedUsers: [],
            uploadDate: new Date(),
            url,
            isFallbackBanner: true,
          };
          baseOriginal.photos = [fallbackPhoto];
          baseOriginal.media = [fallbackPhoto];
          baseOriginal.previewUrl = url;
        }
      }

      if (effectiveType === 'check-in') {
        const checkInUser = await User.findById(original.ownerId)
          .select('firstName lastName')
          .lean();
        baseOriginal.fullName = checkInUser
          ? `${checkInUser.firstName || ''} ${checkInUser.lastName || ''}`.trim()
          : null;
      }

      const enrichedOriginalOwner = await enrichOriginalOwner(
        originalOwner,
        originalOwnerModel
      );
      const enrichedStoryUser = await shapeStoryUploader(user, profilePicMap);

      return {
        _id: storyMeta._id?.toString?.() || storyMeta._id,
        mediaKey: storyMeta.mediaKey,
        mediaType: storyMeta.mediaType,
        caption: storyMeta.caption,
        visibility: storyMeta.visibility,
        expiresAt: storyMeta.expiresAt,
        viewedBy: storyMeta.viewedBy,
        user: enrichedStoryUser,
        original: baseOriginal,
        originalPostType: effectiveType,
        originalPostId: originalPostId?.toString?.(),
        originalOwner: enrichedOriginalOwner,
        originalOwnerModel,
      };
    }

    // -------------------------------------- INVITE --------------------------------------
    if (effectiveType === 'invite') {
      const senderId =
        original.ownerId ||
        original.details?.senderId ||
        original.sender?.id ||
        original.sender;

      const sender = senderId ? await toInviteUserShape(senderId) : null;
      if (!sender || !sender.id) {
        console.warn(
          `[❌ INVITE ENRICH] Missing sender for invite ${original._id} (senderId: ${senderId}) — skipping shared post`
        );
        return null;
      }

      const recipients = await toInviteRecipientsShape(
        original.details?.recipients || []
      );
      const { businessName, businessLogoUrl } = await lookupBusinessBits(
        original.placeId
      );

      const likes = (original.likes || []).map((l) => ({
        userId: (l.userId?._id || l.userId || '').toString?.() || (l.userId || ''),
        fullName: l.fullName || '',
      }));

      const baseInvite = {
        __typename: 'ActivityInvite',
        _id: original._id,
        sender,
        recipients,
        placeId: original.placeId || null,
        businessName,
        businessLogoUrl,
        note: original.note || null,
        dateTime: original.details?.dateTime
          ? new Date(original.details.dateTime).toISOString()
          : null,
        message: original.message || null,
        isPublic: original.privacy ? original.privacy === 'public' : !!original.isPublic,
        status: original.status || 'pending',
        createdAt: original.createdAt
          ? new Date(original.createdAt).toISOString()
          : new Date().toISOString(),
        likes,
        comments,
        type: 'invite',
        requests: (original.details?.requests || []).map((r) => ({
          _id: r._id?.toString?.() || r._id,
          userId: (r.userId?._id || r.userId || '').toString?.() || (r.userId || ''),
          status: r.status || 'pending',
          firstName: r.firstName || null,
          lastName: r.lastName || null,
          profilePicUrl: r.profilePicUrl || null,
        })),
        sortDate: original.sortDate || original.createdAt || null,
      };

      const enrichedOriginalOwner = await enrichOriginalOwner(
        originalOwner,
        originalOwnerModel
      );
      const enrichedStoryUser = await shapeStoryUploader(user, profilePicMap);

      return {
        _id: storyMeta._id?.toString?.() || storyMeta._id,
        mediaKey: storyMeta.mediaKey,
        mediaType: storyMeta.mediaType,
        caption: storyMeta.caption,
        visibility: storyMeta.visibility,
        expiresAt: storyMeta.expiresAt,
        viewedBy: storyMeta.viewedBy,
        user: enrichedStoryUser,
        original: baseInvite,
        originalPostType: effectiveType,
        originalPostId: originalPostId?.toString?.(),
        originalOwner: enrichedOriginalOwner,
        originalOwnerModel,
      };
    }

    return null;
  } catch (err) {
    console.error('[❌ enrichSharedPost failed]', err);
    return null;
  }
}

/* --------------------------------- utils --------------------------------- */

function capitalizeFirstLetter(type) {
  if (!type) return '';
  if (type === 'check-in' || type === 'checkIn') return 'CheckIn';
  if (type === 'invite') return 'ActivityInvite';
  if (type === 'promotion') return 'Promotion';
  if (type === 'event') return 'Event';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

module.exports = {
  gatherUserReviews,
  gatherUserCheckIns,
  resolveTaggedUsers,
  resolveTaggedPhotoUsers,
  resolveUserProfilePics,
  enrichComments,
  enrichSharedPost,
};
