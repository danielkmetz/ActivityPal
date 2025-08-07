const User = require("../models/User");
const Business = require("../models/Business");
const CheckIn = require('../models/CheckIns.js');
const Review = require('../models/Reviews.js');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const haversineDistance = require('../utils/haversineDistance.js');
const { getModelByType } = require('../utils/getModelByType.js');

async function enrichCommentMedia(media) {
  if (!media || !media.photoKey) {
    return null;
  }

  const url = await getPresignedUrl(media.photoKey);

  return {
    photoKey: media.photoKey,
    mediaType: media.mediaType,
    url,
  };
}

async function enrichReplies(replies = []) {
  return Promise.all(
    replies.map(async reply => {
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
    comments.map(async comment => {
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

async function gatherUserReviews(userObjectId, profilePic, profilePicUrl) {
  try {
    const reviews = await Review.find({ userId: userObjectId }).lean();

    const enriched = await Promise.all(
      reviews.map(async (review) => {
        try {
          const [taggedUsers, rawPhotos, business] = await Promise.all([
            resolveTaggedUsers(review.taggedUsers || []),
            resolveTaggedPhotoUsers(review.photos || []),
            Business.findOne({ placeId: review.placeId }).select('businessName').lean(),
          ]);

          const photos = (rawPhotos || []).filter(p => p && p._id && p.photoKey);
          const comments = await enrichComments(review.comments || []);

          return {
            __typename: "Review",
            ...review,
            businessName: business?.businessName || null,
            placeId: review.placeId,
            date: new Date(review.date).toISOString(),
            profilePic,
            profilePicUrl,
            taggedUsers,
            photos,
            comments,
            type: "review",
          };
        } catch {
          return null;
        }
      })
    );

    return enriched.filter(r => r !== null);
  } catch {
    return [];
  }
}

async function gatherUserCheckIns(user, profilePicUrl) {
  try {
    const checkIns = await CheckIn.find({ userId: user._id }).lean();

    const enriched = await Promise.all(
      checkIns.map(async (checkIn) => {
        try {
          const [taggedUsers, rawPhotos, business] = await Promise.all([
            resolveTaggedUsers(checkIn.taggedUsers || []),
            resolveTaggedPhotoUsers(checkIn.photos || []),
            Business.findOne({ placeId: checkIn.placeId?.trim() })
              .select('businessName placeId')
              .lean(),
          ]);

          const photos = (rawPhotos || []).filter(p => p && p._id && p.photoKey);
          const comments = await enrichComments(checkIn.comments || []);

          return {
            __typename: "CheckIn",
            _id: checkIn._id,
            userId: user._id,
            fullName: `${user.firstName} ${user.lastName}`,
            message: checkIn.message,
            date: new Date(checkIn.date).toISOString(),
            profilePic: user.profilePic || null,
            profilePicUrl,
            placeId: checkIn.placeId || null,
            businessName: business?.businessName || "Unknown Business",
            taggedUsers,
            photos,
            likes: checkIn.likes || [],
            comments,
            distance,
            type: "check-in",
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

async function resolveTaggedUsers(taggedUserIds = []) {
  if (!Array.isArray(taggedUserIds) || taggedUserIds.length === 0) return [];

  const ids = taggedUserIds.map(id => id?.toString()).filter(Boolean);

  const users = await User.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1 });
  return users.map(u => ({
    userId: u._id,
    fullName: `${u.firstName} ${u.lastName}`,
  }));
}

async function resolveTaggedPhotoUsers(photos = []) {
  if (!Array.isArray(photos)) return [];

  const cleanPhotos = photos.map(p => p.toObject?.() || p).filter(p => p?.photoKey);

  const allTaggedIds = new Set();
  for (const photo of cleanPhotos) {
    (photo.taggedUsers || []).forEach(tag => tag?.userId && allTaggedIds.add(tag.userId.toString()));
  }

  const taggedUserArray = [...allTaggedIds];
  const taggedUserMap = {};
  if (taggedUserArray.length) {
    const users = await User.find({ _id: { $in: taggedUserArray } }, { firstName: 1, lastName: 1 });
    for (const u of users) {
      taggedUserMap[u._id.toString()] = `${u.firstName} ${u.lastName}`;
    }
  }

  // 🔁 Batch presigned URL generation
  const urlMap = {};
  await Promise.all(cleanPhotos.map(async (p) => {
    urlMap[p.photoKey] = await getPresignedUrl(p.photoKey);
  }));

  return cleanPhotos.map(photo => {
    const enrichedTags = (photo.taggedUsers || []).map(tag => ({
      userId: tag.userId,
      fullName: taggedUserMap[tag.userId?.toString()] || "Unknown User",
      x: tag.x || 0,
      y: tag.y || 0,
    }));

    return {
      ...photo,
      url: urlMap[photo.photoKey],
      taggedUsers: enrichedTags,
    };
  });
}

async function resolveUserProfilePics(userIds) {
  const result = {};

  // Step 1: Try resolving all IDs as Users first
  const users = await User.find({ _id: { $in: userIds } })
    .select('_id profilePic')
    .lean();

  const foundUserIds = new Set(users.map(u => u._id.toString()));

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
      id: user._id.toString(), // <-- Add this
      profilePic: user.profilePic || null,
      profilePicUrl: presignedUrl,
    };
  }

  // Step 2: Check if any IDs were *not* found in Users
  const remainingIds = userIds.filter(id => !foundUserIds.has(id.toString()));
  if (remainingIds.length === 0) return result;

  // Step 3: Query Business only if needed
  const businesses = await Business.find({ _id: { $in: remainingIds } })
    .select('_id logoKey')
    .lean();

  for (const business of businesses) {
    let presignedUrl = null;

    if (business.logoKey) {
      try {
        presignedUrl = await getPresignedUrl(business.logoKey);
      } catch (err) {
        console.warn(`⚠️ Failed to get presigned URL for business ${business._id}:`, err.message);
      }
    }

    result[business._id.toString()] = {
      _id: business._id,
      id: business._id.toString(), // <-- Add this
      profilePic: business.logoKey || null,
      profilePicUrl: presignedUrl,
    };
  }

  return result;
}

async function enrichSharedPost(shared, profilePicMap = {}, userLat = null, userLng = null) {
  try {
    const {
      postType,
      originalPostId,
      original: providedOriginal,
      originalOwner,
      originalOwnerModel,
      user,
      storyMeta = {},
    } = shared;

    const Model = getModelByType(postType);
    if (!Model) return null;

    // ✅ Ensure original is a plain object
    let original = providedOriginal;
    if (!original) {
      original = await Model.findById(originalPostId).lean();
    } else if (typeof original.toObject === 'function') {
      original = original.toObject();
    }

    if (!original || !original._id) {
      console.warn(`[❌ MISSING ORIGINAL DOC] type: ${postType}, originalPostId: ${originalPostId}, sharedId: ${shared._id}`);
      return null;
    }

    original._id = original._id.toString?.() || original._id;
    original.userId = original.userId?.toString?.() || original.userId;

    const profile = profilePicMap[original.userId];
    const profilePic = profile?.profilePic?.photoKey ? profile.profilePic : null;
    const profilePicUrl = profile?.profilePicUrl || null;

    let taggedUsers = [], rawPhotos = [], business = null, comments = [];

    if (['review', 'check-in', 'promotion', 'event'].includes(postType)) {
      taggedUsers = await resolveTaggedUsers(original.taggedUsers || []);
      rawPhotos = await resolveTaggedPhotoUsers(original.photos || []);
    }

    if (['review', 'check-in', 'promotion', 'event', 'invite'].includes(postType)) {
      business = await Business.findOne({ placeId: original.placeId })
        .select('businessName logoKey location')
        .lean();
    }

    if (original.comments) {
      comments = await enrichComments(original.comments);
    }

    let distance = null;
    if (
      ['event', 'promotion', 'promo'].includes(postType) &&
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
      __typename: capitalizeFirstLetter(postType),
      _id: original._id,
      ...original, // allow all original props (you could spread this earlier if preferred)
      businessName: business?.businessName || null,
      businessLogoUrl: business?.logoKey ? await getPresignedUrl(business.logoKey) : null,
      placeId: original.placeId,
      rating: original.rating,
      reviewText: original.reviewText,
      fullName: original.fullName,
      userId: original.userId,
      type: postType,
      profilePic,
      profilePicUrl,
      taggedUsers,
      photos: rawPhotos.filter(p => p && p._id && p.photoKey),
      media: rawPhotos.filter(p => p && p._id && p.photoKey),
      comments,
      date: original.date ? new Date(original.date).toISOString() : new Date().toISOString(),
    };

    if (['event', 'promotion', 'promo'].includes(postType)) {
      Object.assign(baseOriginal, {
        distance,
        formattedAddress: business?.location?.formattedAddress || null,
        recurringDays: original.recurringDays || [],
        startTime: original.startTime || null,
        endTime: original.endTime || null,
        allDay: original.allDay || false,
        createdAt: original.createdAt || null,
        title: original.title || null,
      });
    }

    if (postType === 'check-in') {
      const checkInUser = await User.findById(original.userId).select('firstName lastName').lean();
      baseOriginal.fullName = checkInUser
        ? `${checkInUser.firstName || ''} ${checkInUser.lastName || ''}`.trim()
        : null;
    }

    let enrichedOriginalOwner = null;
    const originalOwnerId = typeof originalOwner === 'object' ? originalOwner._id : originalOwner;

    if (originalOwnerModel === 'User') {
      const ownerUser = await User.findById(originalOwnerId).lean();
      if (ownerUser) {
        enrichedOriginalOwner = {
          __typename: 'User',
          id: ownerUser._id.toString(),
          firstName: ownerUser.firstName || '',
          lastName: ownerUser.lastName || '',
          profilePicUrl: ownerUser.profilePic?.photoKey
            ? await getPresignedUrl(ownerUser.profilePic.photoKey)
            : null,
        };
      }
    } else if (originalOwnerModel === 'Business') {
      const ownerBiz = await Business.findById(originalOwnerId).lean();
      if (ownerBiz) {
        enrichedOriginalOwner = {
          __typename: 'Business',
          id: ownerBiz._id.toString(),
          businessName: ownerBiz.businessName || '',
          logoUrl: ownerBiz.logoKey
            ? await getPresignedUrl(ownerBiz.logoKey)
            : null,
        };
      }
    }

    const enrichedStoryUser = user?.businessName || user?.placeId
      ? {
          __typename: 'Business',
          id: user._id?.toString?.() || user.id,
          businessName: user.businessName || '',
          logoUrl: user.logoKey ? await getPresignedUrl(user.logoKey) : null,
        }
      : {
          __typename: 'User',
          id: user._id?.toString?.() || user.id,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          profilePicUrl: user.profilePic?.photoKey
            ? await getPresignedUrl(user.profilePic.photoKey)
            : null,
        };

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
      originalPostType: postType,
      originalPostId: originalPostId?.toString?.(),
      originalOwner: enrichedOriginalOwner,
      originalOwnerModel,
    };
  } catch (err) {
    console.error('[❌ enrichSharedPost failed]', err);
    return null;
  }
}

// Utility to ensure GraphQL-friendly __typename
function capitalizeFirstLetter(type) {
  if (!type) return '';
  if (type === 'check-in') return 'CheckIn';
  if (type === 'checkIn') return 'CheckIn';
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
