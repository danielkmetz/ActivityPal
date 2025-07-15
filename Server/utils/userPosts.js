const User = require("../models/User");
const Business = require("../models/Business");
const CheckIn = require('../models/CheckIns.js');
const Review = require('../models/Reviews.js');
const Promotion = require('../models/Promotions.js');
const Event = require('../models/Events.js');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

function getModelByType(type) {
  switch (type) {
    case 'review': return Review;
    case 'checkin': return CheckIn;
    case 'invite': return ActivityInvite;
    case 'promotion': return Promotion;
    case 'event': return Event;
    default: return null;
  }
}

async function enrichCommentMedia(media) {
  if (!media || !media.photoKey) {
    return null;
  }

  const url = await getPresignedUrl(media.photoKey);
  
  return {
    photoKey: media.photoKey,
    mediaType: media.mediaType,
    mediaUrl: url,
  };
}

async function enrichReplies(replies = []) {
  return Promise.all(
    replies.map(async reply => {
      const enrichedMedia = await enrichCommentMedia(reply.media);
      const nestedReplies = await enrichReplies(reply.replies || []);
      
      return {
        ...reply,
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
      profilePic: user.profilePic || null,
      profilePicUrl: presignedUrl,
    };
  }

  // Step 2: Check if any IDs were *not* found in Users
  const remainingIds = userIds.filter(id => !foundUserIds.has(id.toString()));
  if (remainingIds.length === 0) return result;

  // Step 3: Only query Business if needed
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
      profilePic: business.logoKey || null,
      profilePicUrl: presignedUrl,
    };
  }

  return result;
}

async function enrichSharedPost(shared, profilePicMap = {}) {
  try {
    const { postType, originalPostId } = shared;
    const Model = getModelByType(postType);
    if (!Model) return null;

    const original = await Model.findById(originalPostId).lean();
    if (!original) return null;

    switch (postType) {
      case 'review': {
        const taggedUsers = await resolveTaggedUsers(original.taggedUsers || []);
        const rawPhotos = await resolveTaggedPhotoUsers(original.photos || []);
        const business = await Business.findOne({ placeId: original.placeId }).select('businessName').lean();
        const comments = await enrichComments(original.comments || []);

        return {
          __typename: "Review",
          ...original,
          businessName: business?.businessName || null,
          date: new Date(original.date).toISOString(),
          profilePic: profilePicMap[original.userId?.toString()]?.profilePic || null,
          profilePicUrl: profilePicMap[original.userId?.toString()]?.profilePicUrl || null,
          taggedUsers,
          photos: rawPhotos.filter(p => p && p._id && p.photoKey),
          comments,
          type: "review",
        };
      }

      case 'checkin': {
        const taggedUsers = await resolveTaggedUsers(original.taggedUsers || []);
        const rawPhotos = await resolveTaggedPhotoUsers(original.photos || []);
        const business = await Business.findOne({ placeId: original.placeId }).select('businessName').lean();
        const comments = await enrichComments(original.comments || []);

        return {
          __typename: "CheckIn",
          ...original,
          date: new Date(original.date).toISOString(),
          profilePic: profilePicMap[original.userId?.toString()]?.profilePic || null,
          profilePicUrl: profilePicMap[original.userId?.toString()]?.profilePicUrl || null,
          businessName: business?.businessName || null,
          photos: rawPhotos.filter(p => p && p._id && p.photoKey),
          taggedUsers,
          comments,
          type: "check-in",
        };
      }

      case 'invite': {
        const business = await Business.findOne({ placeId: original.placeId }).lean();
        const comments = await enrichComments(original.comments || []);
        const logoUrl = business?.logoKey ? await getPresignedUrl(business.logoKey) : null;

        return {
          __typename: "ActivityInvite",
          ...original,
          businessName: business?.businessName || null,
          businessLogoUrl: logoUrl,
          comments,
          type: "invite",
        };
      }

      case 'promotion':
      case 'event': {
        const business = await Business.findOne({ placeId: original.placeId }).lean();
        const comments = await enrichComments(original.comments || []);
        const logoUrl = business?.logoKey ? await getPresignedUrl(business.logoKey) : null;

        return {
          __typename: postType === 'promotion' ? "Promotion" : "Event",
          ...original,
          businessName: business?.businessName || null,
          businessLogoUrl: logoUrl,
          comments,
          type: postType,
        };
      }

      default:
        return null;
    }
  } catch (err) {
    console.error("❌ Error enriching shared post:", err);
    return null;
  }
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
