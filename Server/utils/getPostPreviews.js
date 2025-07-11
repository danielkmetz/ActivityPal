const Review = require('../models/Reviews');
const CheckIn = require('../models/CheckIns');
const ActivityInvite = require('../models/ActivityInvites');
const Event = require('../models/Events');
const Promotion = require('../models/Promotions');
const User = require('../models/User');
const Business = require('../models/Business');
const { getPresignedUrl } = require('./cachePresignedUrl');

const getPostPreviews = async (postRefs = []) => {
  const previews = await Promise.all(
    postRefs.map(async ({ postType, postId }) => {
      try {
        let post = null;
        let user = null;
        let business = null;
        let firstMediaKey = null;
        let mediaType = null;

        switch (postType) {
          case 'review': {
            post = await Review.findById(postId).lean();
            if (!post) return null;

            user = await User.findById(post.userId).select("firstName lastName").lean();

            if (post.photos?.length > 0) {
              const first = post.photos[0];
              firstMediaKey = first.photoKey;
              mediaType = first.photoKey?.endsWith('.mp4') ? 'video' : 'image';
            }
            break;
          }

          case 'check-in': {
            post = await CheckIn.findById(postId).lean();
            if (!post) return null;

            user = await User.findById(post.userId).select("firstName lastName").lean();

            if (post.photos?.length > 0) {
              const first = post.photos[0];
              firstMediaKey = first.photoKey;
              mediaType = first.photoKey?.endsWith('.mp4') ? 'video' : 'image';
            }
            break;
          }

          case 'invite': {
            post = await ActivityInvite.findById(postId).lean();
            if (!post) return null;

            user = await User.findById(post.senderId).select("firstName lastName").lean();

            if (post.media?.length > 0) {
              const first = post.media[0];
              firstMediaKey = first.photoKey || first.videoKey;
              mediaType = first.videoKey ? 'video' : 'image';
            }
            break;
          }

          case 'event': {
            post = await Event.findById(postId).lean();
            if (!post) return null;

            business = await Business.findOne({placeId: post.placeId}).select("businessName").lean();

            if (post.photos?.length > 0) {
              const first = post.photos[0];
              firstMediaKey = first.photoKey || first.videoKey;
              mediaType = first.videoKey ? 'video' : 'image';
            }
            break;
          }

          case 'promotion':
          case 'promo': {
            post = await Promotion.findById(postId).lean();
            if (!post) return null;

            business = await Business.findOne({placeId: post.placeId}).select("businessName").lean();

            if (post.photos?.length > 0) {
              const first = post.photos[0];
              firstMediaKey = first.photoKey || first.videoKey;
              mediaType = first.videoKey ? 'video' : 'image';
            }
            break;
          }

          default:
            return null;
        }

        const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
        const mediaUrl = firstMediaKey ? await getPresignedUrl(firstMediaKey) : null;

        return {
          postId,
          postType,
          fullName,
          business,
          mediaUrl,
          mediaType,
        };
      } catch (err) {
        console.warn(`⚠️ Failed to fetch preview for ${postType} ${postId}:`, err.message);
        return null;
      }
    })
  );

  return previews.filter(Boolean);
};

module.exports = getPostPreviews;
