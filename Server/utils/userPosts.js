const User = require('../models/User');
const Business = require('../models/Business');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');

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

  const cleanPhotos = photos
    .map((p) => p.toObject?.() || p)
    .filter((p) => p?.photoKey);

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

module.exports = {
  resolveTaggedUsers,
  resolveTaggedPhotoUsers,
  resolveUserProfilePics,
  enrichComments,
};
