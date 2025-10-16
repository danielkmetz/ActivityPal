const User = require('../models/User');
const Business = require('../models/Business');
const Review = require('../models/Reviews');
const CheckIn = require('../models/CheckIns');
const ActivityInvite = require('../models/ActivityInvites');
const Promotion = require('../models/Promotions');
const Event = require('../models/Events');
const SharedPost = require('../models/SharedPost');
const { normalizePostType } = require('./normalizePostType.js');
const { getPresignedUrl } = require('./cachePresignedUrl.js');
const { resolveUserProfilePics, enrichComments, resolveTaggedPhotoUsers } = require('./userPosts.js')

async function getTaggedUsers(userIdsOrTags = []) {
    const ids = userIdsOrTags.map(x => x?.userId || x).filter(Boolean);
    if (!ids.length) return [];
    const users = await User.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1 }).lean();
    return users.map(u => ({ userId: u._id, fullName: `${u.firstName} ${u.lastName}` }));
}

async function getProfilePicUrl(user) {
    if (user?.profilePic?.photoKey) {
        return await getPresignedUrl(user.profilePic.photoKey);
    }
    return null;
}
const fullNameFrom = (u) => `${u?.firstName || ''} ${u?.lastName || ''}`.trim();

const makeRequestMemo = () => ({
    users: new Map(),       // userId -> user doc
    businesses: new Map(),  // placeId -> business doc
    pics: new Map(),        // userId -> profilePicUrl
});

function makeLoaders(memo) {
    const getUser = async (userId) => {
        if (!userId) return null;
        const key = String(userId);
        if (memo.users.has(key)) return memo.users.get(key);
        const doc = await User.findById(userId)
            .select('firstName lastName profilePic') // you only read these
            .lean();
        memo.users.set(key, doc || null);
        return doc || null;
    };

    const getBusinessByPlaceId = async (placeId) => {
        if (!placeId) return null;
        const key = String(placeId);
        if (memo.businesses.has(key)) return memo.businesses.get(key);
        const doc = await Business.findOne({ placeId }).lean();
        memo.businesses.set(key, doc || null);
        return doc || null;
    };

    const getUserPicUrlById = async (userId) => {
        if (!userId) return null;
        const key = String(userId);
        if (memo.pics.has(key)) return memo.pics.get(key);
        const map = await resolveUserProfilePics([userId]);
        const url = map?.[key]?.profilePicUrl || null;
        memo.pics.set(key, url);
        return url;
    };

    const toGqlUser = async (u) => {
        if (!u) return null;
        const url = await getUserPicUrlById(u._id);
        const uploadDateMs = u?.profilePic?.uploadDate
            ? String(Number(u.profilePic.uploadDate))
            : (u?.profilePic?.createdAt ? String(new Date(u.profilePic.createdAt).getTime()) : null);

        return {
            __typename: 'User',
            id: u._id?.toString?.(),
            firstName: u.firstName || null,
            lastName: u.lastName || null,
            profilePic: u.profilePic
                ? {
                    __typename: 'ProfilePic',
                    description: u.profilePic.description || '',
                    photoKey: u.profilePic.photoKey || null,
                    uploadDate: uploadDateMs,
                }
                : null,
            profilePicUrl: url || null,
        };
    };

    return { getUser, getBusinessByPlaceId, getUserPicUrlById, toGqlUser };
}

// Per-type normalizers (canonical internal shape)
function makeNormalizers(loaders) {
    return {
        async review(r) {
            const [u, b, pics, tags, comments] = await Promise.all([
                loaders.getUser(r.userId),
                loaders.getBusinessByPlaceId(r.placeId),
                resolveTaggedPhotoUsers(r.photos || []),
                getTaggedUsers(r.taggedUsers || []),
                enrichComments(r.comments || []),
            ]);
            const authorPic = await loaders.getUserPicUrlById(r.userId);

            return {
                type: 'review',
                _id: r._id,
                userId: r.userId,
                fullName: r.fullName || fullNameFrom(u),
                profilePicUrl: authorPic,
                businessName: b?.businessName || null,
                placeId: r.placeId || b?.placeId || null,
                rating: r.rating ?? null,
                priceRating: r.priceRating ?? null,
                atmosphereRating: r.atmosphereRating ?? null,
                serviceRating: r.serviceRating ?? null,
                wouldRecommend: r.wouldRecommend ?? null,
                reviewText: r.reviewText ?? null,
                message: r.message ?? null,
                date: r.timestamp || r.date || null,
                photos: pics,
                taggedUsers: tags,
                likes: r.likes || [],
                comments,
                __typename: 'Review', // helpful for nested use inside shared
            };
        },

        async ['check-in'](c) {
            const [u, b, pics, tags, comments] = await Promise.all([
                loaders.getUser(c.userId),
                loaders.getBusinessByPlaceId(c.placeId),
                resolveTaggedPhotoUsers(c.photos || []),
                getTaggedUsers(c.taggedUsers || []),
                enrichComments(c.comments || []),
            ]);
            const authorPic = await loaders.getUserPicUrlById(c.userId);

            return {
                type: 'check-in',
                _id: c._id,
                userId: c.userId,
                fullName: c.fullName || fullNameFrom(u),
                profilePicUrl: authorPic,
                businessName: b?.businessName || null,
                placeId: c.placeId || b?.placeId || null,
                message: c.message || null,
                date: c.timestamp || c.date || null,
                photos: pics,
                taggedUsers: tags,
                likes: c.likes || [],
                comments,
                __typename: 'CheckIn',
            };
        },

        async invite(i) {
            const [senderDoc, b, comments] = await Promise.all([
                loaders.getUser(i.senderId),
                loaders.getBusinessByPlaceId(i.placeId),
                enrichComments(i.comments || []),
            ]);
            const senderPic = await getProfilePicUrl(senderDoc);

            return {
                type: 'invite',
                _id: i._id,
                userId: i.senderId,
                fullName: fullNameFrom(senderDoc),
                profilePicUrl: senderPic,
                businessName: b?.businessName || null,
                placeId: i.placeId || b?.placeId || null,
                note: i.note ?? null,
                isPublic: i.isPublic ?? false,
                recipients: i.recipients || [],
                requests: i.requests || [],
                date: i.dateTime || i.date || null,
                comments,
                __typename: 'Invite',
            };
        },

        async promotion(p) {
            const b = await loaders.getBusinessByPlaceId(p.placeId);
            return {
                type: 'promotion',
                _id: p._id,
                businessName: b?.businessName || null,
                placeId: p.placeId || b?.placeId || null,
                title: p.title || p.name || null,
                allDay: p.allDay ?? null,
                start: p.startDate || p.startTime || null,
                end: p.endDate || p.endTime || null,
                coverImageUrl: p.coverImageUrl || p.businessLogoUrl || null,
                __typename: 'Promotion',
            };
        },

        async event(e) {
            const b = await loaders.getBusinessByPlaceId(e.placeId);
            return {
                type: 'event',
                _id: e._id,
                businessName: b?.businessName || null,
                placeId: e.placeId || b?.placeId || null,
                title: e.title || e.name || null,
                allDay: e.allDay ?? null,
                start: e.startDate || e.startTime || null,
                end: e.endDate || e.endTime || null,
                coverImageUrl: e.coverImageUrl || e.bannerUrl || null,
                __typename: 'Event',
            };
        },
    };
}

// Flatten canonical to your existing non-shared response shape
const toFlatResponseFromCanonical = (p) => ({
    _id: p._id,
    userId: p.userId,
    fullName: p.fullName,
    rating: p.type === 'review' ? p.rating : null,
    priceRating: p.type === 'review' ? p.priceRating : null,
    atmosphereRating: p.type === 'review' ? p.atmosphereRating : null,
    serviceRating: p.type === 'review' ? p.serviceRating : null,
    wouldRecommend: p.type === 'review' ? p.wouldRecommend : null,
    reviewText: p.type === 'review' ? p.reviewText : null,
    message: p.message || null,
    date: p.date || null,
    photos: p.photos || [],
    likes: p.likes || [],
    comments: p.comments || [],
    profilePicUrl: p.profilePicUrl || null,
    businessName: p.businessName || null,
    placeId: p.placeId || null,
    recipients: p.type === 'invite' ? (p.recipients || []) : undefined,
    requests: p.type === 'invite' ? (p.requests || []) : undefined,
    note: p.type === 'invite' ? p.note : undefined,
    isPublic: p.type === 'invite' ? p.isPublic : undefined,
    taggedUsers: p.taggedUsers || [],
    type: p.type,
});

async function buildSharedPostPayload(shared, loaders) {
    const normalizers = makeNormalizers(loaders);

    const origType = normalizePostType(shared.postType);
    let original = null;
    let originalOwner = null;

    if (origType && normalizers[origType]) {
        const MODEL = {
            review: Review,
            'check-in': CheckIn,
            invite: ActivityInvite,
            promotion: Promotion,
            event: Event,
        };
        const Model = MODEL[origType];
        if (Model) {
            const origDoc = await Model.findById(shared.originalPostId).lean();
            if (origDoc) {
                original = await normalizers[origType](origDoc);
                const author =
                    origType === 'invite'
                        ? await loaders.getUser(origDoc.senderId)
                        : await loaders.getUser(origDoc.userId);
                originalOwner = await loaders.toGqlUser(author);
            }
        }
    }

    const sharer = await loaders.getUser(shared.user);
    const userObj = await loaders.toGqlUser(sharer);

    const createdAtMs =
        typeof shared.createdAt === 'number'
            ? shared.createdAt
            : (shared.createdAt ? new Date(shared.createdAt).getTime() : Date.now());

    return {
        __typename: 'SharedPost',
        _id: shared._id,
        caption: shared.caption || '',
        comments: await enrichComments(shared.comments || []),
        createdAt: String(createdAtMs),        // epoch ms string (matches your “correct payload”)
        original,
        originalOwner,
        originalPostId: shared.originalPostId?.toString?.() || null,
        postType: shared.postType || (original?.type ?? null),
        sortDate: new Date(createdAtMs).toISOString(),
        type: 'sharedPost',
        user: userObj,
    };
}

// ===== Public API =====
/**
 * Fetch + normalize any post by id.
 * - For sharedPost: returns GraphQL-like nested shape (your “correct payload”)
 * - For others: returns your flat legacy shape used by the app
 */
async function getPostPayloadById(rawType, postId) {
    const postType = normalizePostType(rawType);
    if (!postType) return null;

    const memo = makeRequestMemo();
    const loaders = makeLoaders(memo);

    if (postType === 'sharedPost') {
        const shared = await SharedPost.findById(postId).lean();
        if (!shared) return null;
        return await buildSharedPostPayload(shared, loaders);
    }

    const MODEL = {
        review: Review,
        'check-in': CheckIn,
        invite: ActivityInvite,
        promotion: Promotion,
        event: Event,
    };
    const Model = MODEL[postType];
    if (!Model) return null;

    const doc = await Model.findById(postId).lean();
    if (!doc) return null;

    const normalizers = makeNormalizers(loaders);
    const canonical = await normalizers[postType](doc);
    return toFlatResponseFromCanonical(canonical);
}

module.exports = {
    getPostPayloadById,
    toFlatResponseFromCanonical, // exported in case you want it elsewhere
};