const Business = require('../models/Business');
const User = require('../models/User');
const ActivityInvite = require('../models/ActivityInvites');
const { getPresignedUrl } = require('./cachePresignedUrl');

const getPostPreviews = async (postRefs = []) => {
    const previews = await Promise.all(
        postRefs.map(async ({ postType, postId }) => {
            try {
                let user = null;
                let post = null;
                let firstMediaKey = null;
                let mediaType = null;

                switch (postType) {
                    case 'review': {
                        const business = await Business.findOne({ "reviews._id": postId });
                        if (!business) return null;
                        post = business.reviews.id(postId);
                        user = await User.findById(post.userId).select("firstName lastName").lean();

                        if (post.photos?.length > 0) {
                            const firstMedia = post.photos[0];
                            firstMediaKey = firstMedia.photoKey;
                            mediaType = firstMedia.photoKey?.endsWith('.mp4') ? 'video' : 'image';
                        }
                        break;
                    }

                    case 'check-in': {
                        const userDoc = await User.findOne({ "checkIns._id": postId });
                        if (!userDoc) return null;
                        post = userDoc.checkIns.id(postId);
                        user = await User.findById(post.userId).select("firstName lastName").lean();

                        if (post.photos?.length > 0) {
                            const firstMedia = post.photos[0];
                            firstMediaKey = firstMedia.photoKey;
                            mediaType = firstMedia.photoKey?.endsWith('.mp4') ? 'video' : 'image';
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

                    default:
                        return null;
                }

                const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
                const mediaUrl = firstMediaKey ? await getPresignedUrl(firstMediaKey) : null;

                return {
                    postId,
                    postType,
                    fullName,
                    mediaUrl,
                    mediaType,
                };
            } catch (err) {
                return null;
            }
        })
    );

    return previews.filter(p => p !== null);
};

module.exports = getPostPreviews;
