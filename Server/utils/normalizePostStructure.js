// posts/getPostPayloadById.js
const { Post } = require('../models/Post');
const User = require('../models/User');
const Business = require('../models/Business');
const { enrichComments, resolveTaggedPhotoUsers, resolveUserProfilePics } = require('./userPosts');
const { getPresignedUrl } = require('./cachePresignedUrl');

const fullNameFrom = (u) => `${u?.firstName || ''} ${u?.lastName || ''}`.trim();

function makeRequestMemo() {
  return { users: new Map(), businesses: new Map(), pics: new Map() };
}
function makeLoaders(memo) {
  const getUser = async (id) => {
    if (!id) return null;
    const k = String(id);
    if (memo.users.has(k)) return memo.users.get(k);
    const doc = await User.findById(id).select('firstName lastName profilePic').lean();
    memo.users.set(k, doc || null);
    return doc || null;
  };
  const getBizByPlaceId = async (placeId) => {
    if (!placeId) return null;
    const k = String(placeId);
    if (memo.businesses.has(k)) return memo.businesses.get(k);
    const doc = await Business.findOne({ placeId }).lean();
    memo.businesses.set(k, doc || null);
    return doc || null;
  };
  const getPicUrl = async (userId) => {
    if (!userId) return null;
    const k = String(userId);
    if (memo.pics.has(k)) return memo.pics.get(k);
    const map = await resolveUserProfilePics([userId]);
    const url = map?.[k]?.profilePicUrl || null;
    memo.pics.set(k, url);
    return url;
  };
  return { getUser, getBizByPlaceId, getPicUrl };
}

async function normalizeUnified(post, loaders) {
  const type = post.type;

  // common bits
  const [author, biz, comments, media] = await Promise.all([
    loaders.getUser(post.ownerId),
    post.placeId ? loaders.getBizByPlaceId(post.placeId) : null,
    enrichComments(post.comments || []),
    resolveTaggedPhotoUsers(post.media || []),
  ]);
  const profilePicUrl = await loaders.getPicUrl(post.ownerId);
  const base = {
    _id: post._id,
    userId: post.ownerId,
    fullName: fullNameFrom(author),
    profilePicUrl,
    businessName: biz?.businessName || null,
    placeId: post.placeId || biz?.placeId || null,
    message: post.message || null,
    photos: media,
    media,
    taggedUsers: post.taggedUsers || [],
    likes: post.likes || [],
    comments,
    type,
  };

  if (type === 'review') {
    const d = post.details || {};
    return {
      __typename: 'Review',
      ...base,
      rating: d.rating ?? null,
      priceRating: d.priceRating ?? null,
      atmosphereRating: d.atmosphereRating ?? null,
      serviceRating: d.serviceRating ?? null,
      wouldRecommend: d.wouldRecommend ?? null,
      reviewText: d.reviewText ?? null,
      date: post.createdAt ? new Date(post.createdAt).toISOString() : null,
    };
  }

  if (type === 'check-in') {
    const d = post.details || {};
    return {
      __typename: 'CheckIn',
      ...base,
      date: d.date ? new Date(d.date).toISOString() : (post.createdAt ? new Date(post.createdAt).toISOString() : null),
    };
  }

  if (type === 'invite') {
    const d = post.details || {};
    return {
      __typename: 'ActivityInvite',
      ...base,
      note: post.note ?? null,
      isPublic: post.privacy === 'public',
      recipients: d.recipients || [],
      requests: d.requests || [],
      date: d.dateTime ? new Date(d.dateTime).toISOString() : null,
    };
  }

  if (type === 'promotion') {
    const d = post.details || {};
    const logoUrl = biz?.logoKey ? await getPresignedUrl(biz.logoKey) : null;
    return {
      __typename: 'Promotion',
      ...base,
      title: post.title || null,
      allDay: post.allDay ?? null,
      start: d.startsAt || null,
      end: d.endsAt || null,
      coverImageUrl: logoUrl,
    };
  }

  if (type === 'event') {
    const d = post.details || {};
    const bannerUrl = biz?.bannerKey ? await getPresignedUrl(biz.bannerKey) : null;
    return {
      __typename: 'Event',
      ...base,
      title: post.title || null,
      allDay: post.allDay ?? null,
      start: d.startsAt || null,
      end: d.endsAt || null,
      coverImageUrl: bannerUrl,
    };
  }

  return base; // for future types
}

async function buildSharedFromUnified(sharedPost, loaders) {
  const original = sharedPost.shared?.originalPostId
    ? await Post.findById(sharedPost.shared.originalPostId).lean()
    : null;

  const normalizedOriginal = original ? await normalizeUnified(original, loaders) : null;

  const sharer = await loaders.getUser(sharedPost.ownerId);
  const createdAtMs = sharedPost.createdAt
    ? new Date(sharedPost.createdAt).getTime()
    : Date.now();

  return {
    __typename: 'SharedPost',
    _id: sharedPost._id,
    caption: sharedPost.message || '',
    comments: await enrichComments(sharedPost.comments || []),
    createdAt: String(createdAtMs),
    original: normalizedOriginal,
    originalOwner: sharer
      ? {
          __typename: 'User',
          id: sharer._id?.toString?.(),
          firstName: sharer.firstName || null,
          lastName: sharer.lastName || null,
          profilePicUrl: await (async () => {
            if (!sharer?.profilePic?.photoKey) return null;
            return getPresignedUrl(sharer.profilePic.photoKey);
          })(),
        }
      : null,
    originalPostId: sharedPost.shared?.originalPostId?.toString?.() || null,
    postType: normalizedOriginal?.type ?? original?.type ?? null,
    sortDate: new Date(createdAtMs).toISOString(),
    type: 'sharedPost',
    user: null, // if you still need a shaped "user" object for the sharer, reuse toGqlUser here
  };
}

async function getPostPayloadById(postId) {
  const memo = makeRequestMemo();
  const loaders = makeLoaders(memo);
  const doc = await Post.findById(postId).lean();
  if (!doc) return null;
  if (doc.type === 'sharedPost') return buildSharedFromUnified(doc, loaders);
  return normalizeUnified(doc, loaders);
}

module.exports = { getPostPayloadById, normalizeUnified };
