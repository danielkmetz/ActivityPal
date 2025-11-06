const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const Business = require('../models/Business.js');
const User = require('../models/User.js');
const { Post } = require('../models/Post.js'); // unified model with discriminators
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const {
  resolveTaggedPhotoUsers,
  resolveTaggedUsers,
  resolveUserProfilePics
} = require('../utils/userPosts.js');

// -------------------- constants --------------------
const ALLOWED_TYPES = new Set([
  'review',
  'check-in',
  'invite',
  'event',
  'promotion',
  'sharedPost',
  'liveStream',
]);

// -------------------- helpers --------------------
const oid = (v) => (isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : v);
const nonEmpty = (v) => v !== undefined && v !== null && v !== '';
const nowISO = () => new Date().toISOString();

function normalizePoint(loc) {
  if (!loc) return null;

  // support {lat, lng}
  if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    return { type: 'Point', coordinates: [loc.lng, loc.lat] };
  }

  // support {coordinates: [lng, lat]}
  if (Array.isArray(loc.coordinates) &&
      loc.coordinates.length === 2 &&
      loc.coordinates.every(n => typeof n === 'number' && !Number.isNaN(n))) {
    return { type: 'Point', coordinates: loc.coordinates };
  }

  return null; // invalid
}

function buildFullName(u) {
  return [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || null;
}

async function getProfilePicUrl(user) {
  const key = user?.profilePic?.photoKey;
  if (!key) return null;
  return getPresignedUrl ? await getPresignedUrl(key) : key; // fall back to raw key if you don’t sign here
}

async function upsertBusinessIfNeeded(placeId, businessName, location) {
  if (!placeId) return null;
  const formatted =
    typeof location === 'string'
      ? location
      : location?.formattedAddress || location?.formatted_address || 'Unknown Address';

  return Business.findOneAndUpdate(
    { placeId },
    {
      $setOnInsert: {
        placeId,
        businessName: businessName || 'Unknown Business',
        location: { type: 'Point', coordinates: [0, 0], formattedAddress: formatted },
        firstName: 'N/A',
        lastName: 'N/A',
        email: 'N/A',
        password: 'N/A',
      },
    },
    { upsert: true, new: true }
  );
}

async function buildMediaFromPhotos(photos = [], uploadedBy) {
  return Promise.all(
    photos.map(async (p) => {
      const formattedTagged = Array.isArray(p.taggedUsers)
        ? p.taggedUsers.map((tag) => ({
            userId: oid(tag.userId),
            x: tag.x,
            y: tag.y,
          }))
        : [];
      return {
        photoKey: p.photoKey,
        uploadedBy: oid(uploadedBy),
        description: p.description || null,
        taggedUsers: formattedTagged,
        uploadDate: new Date(),
      };
    })
  );
}

function extractTaggedUserIds(input = []) {
  return input
    .map((t) => (typeof t === 'object' && t !== null ? t.userId || t._id : t))
    .filter(Boolean)
    .map((v) => oid(v));
}

function getSortDateForType(type, details) {
  switch (type) {
    case 'review':
      return new Date(); // or details?.date if you store one
    case 'check-in':
      return details?.date ? new Date(details.date) : new Date();
    case 'invite':
      return details?.dateTime ? new Date(details.dateTime) : new Date();
    case 'event':
      return details?.startsAt ? new Date(details.startsAt) : new Date();
    case 'promotion':
      return details?.startsAt ? new Date(details.startsAt) : new Date();
    case 'liveStream':
      return details?.startedAt ? new Date(details.startedAt) : new Date();
    case 'sharedPost':
    default:
      return new Date();
  }
}

function buildDetailsForType(type, body) {
  switch (type) {
    case 'review':
      return {
        rating: body.rating,
        reviewText: body.reviewText,
        priceRating: body.priceRating,
        atmosphereRating: body.atmosphereRating,
        serviceRating: body.serviceRating,
        wouldRecommend: body.wouldRecommend,
        fullName: body.fullName,
      };

    case 'check-in':
      return {
        date: body.date || new Date(),
      };

    case 'invite':
      return {
        dateTime: body.dateTime,
        recipients: (body.recipients || []).map((r) => ({
          userId: oid(r.userId),
          status: r.status || 'pending',
        })),
        requests: (body.requests || []).map((r) => ({
          userId: oid(r.userId),
          status: r.status || 'pending',
          requestedAt: r.requestedAt ? new Date(r.requestedAt) : new Date(),
        })),
      };

    case 'event':
      return {
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        hostId: body.hostId ? oid(body.hostId) : undefined,
      };

    case 'promotion':
      return {
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        discountPct: body.discountPct,
        code: body.code,
      };

    case 'sharedPost':
      // shared.* lives outside details, but we may store auxiliary info in details if you want
      return body.sharedDetails || {};

    case 'liveStream':
      return {
        title: body.title || '',
        status: body.status || 'idle',
        coverKey: body.coverKey || null,
        durationSec: body.durationSec,
        viewerPeak: body.viewerPeak || 0,
        startedAt: body.startedAt,
        endedAt: body.endedAt,
      };

    default:
      return {};
  }
}

function buildSharedSection(type, body) {
  if (type !== 'sharedPost') return undefined;
  if (!body.originalPostId) throw new Error('originalPostId is required for sharedPost');
  return {
    originalPostId: oid(body.originalPostId),
    originalOwner: body.originalOwner ? oid(body.originalOwner) : undefined,
    originalOwnerModel: body.originalOwnerModel || 'User',
    snapshot: body.snapshot || undefined,
  };
}

function buildRefsSection(type, body) {
  if (type === 'liveStream' && body.liveStreamId) {
    return { liveStreamId: oid(body.liveStreamId) };
  }
  return undefined;
}

async function enrichPostForResponse(p) {
  return {
    ...p,
    media: await resolveTaggedPhotoUsers(p.media || []),
  };
}

async function diffAndNotifyTags({ post, prevTaggedUserIds, prevPhotos }) {
  const prevPhotosByKey = new Map((prevPhotos || []).map((p) => [p.photoKey, p]));
  const newPhotosByKey = new Map((post.media || []).map((p) => [p.photoKey, p]));

  const deletedPhotoKeys = [...prevPhotosByKey.keys()].filter((k) => !newPhotosByKey.has(k));
  const addedPhotoKeys = [...newPhotosByKey.keys()].filter((k) => !prevPhotosByKey.has(k));

  const removedPhotoTaggedUserIds = deletedPhotoKeys.flatMap((key) =>
    (prevPhotosByKey.get(key)?.taggedUsers || []).map((t) => t.userId.toString())
  );
  const addedPhotoTaggedUserIds = addedPhotoKeys.flatMap((key) =>
    (newPhotosByKey.get(key)?.taggedUsers || []).map((t) => t.userId.toString())
  );

  const newTaggedUserIds = (post.taggedUsers || []).map((id) => id.toString());

  const oldTagged = new Set([...prevTaggedUserIds, ...removedPhotoTaggedUserIds]);
  const nextTagged = new Set([...newTaggedUserIds, ...addedPhotoTaggedUserIds]);

  const removedTags = [...oldTagged].filter((x) => !nextTagged.has(x));
  const addedTags = [...nextTagged].filter((x) => !oldTagged.has(x));

  // remove old notifications
  await Promise.all(
    removedTags.map((uid) =>
      User.findByIdAndUpdate(uid, { $pull: { notifications: { targetId: post._id } } })
    )
  );

  // add new notifications
  await Promise.all(
    addedTags.map((uid) =>
      User.findByIdAndUpdate(uid, {
        $push: {
          notifications: {
            type: 'tag',
            message: `Someone tagged you in a ${post.type}.`,
            targetId: post._id,
            typeRef: 'Post',
            postType: post.type,
            senderId: post.ownerId,
            date: new Date(),
            read: false,
          },
        },
      })
    )
  );
}

// ======================= ROUTES =======================

/**
 * GET /:postType/:postId
 * Fetch a single post of a specific type
 */
router.get('/:postId', async (req, res) => {
  const TAG = '[GET /posts/:postType/:postId]';
  const { postId } = req.params;
  const postType = req.body.type || req.body.postType;

  if (!ALLOWED_TYPES.has(postType)) return res.status(400).json({ message: 'Unsupported postType' });
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });

  try {
    const post = await Post.findOne({ _id: postId, type: postType }).lean();
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const enriched = await enrichPostForResponse(post);
    return res.status(200).json(enriched);
  } catch (err) {
    console.error(`${TAG} ❌ 500`, { at: nowISO(), postType, postId, message: err?.message });
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * POST /:postType
 * Create a post of a specific type
 */
router.post('/', async (req, res) => {
  const postType = req.body.type || req.body.postType;
  if (!ALLOWED_TYPES.has(postType)) return res.status(400).json({ message: 'Unsupported postType' });

  const { userId, placeId, location: rawLoc, businessName, privacy, isPublic, message, photos, taggedUsers } = req.body;

  try {
    const business = await upsertBusinessIfNeeded(placeId, businessName, req.body.location);
    const media = await buildMediaFromPhotos(photos || [], userId);
    const postLevelTags = extractTaggedUserIds(taggedUsers);
    const loc = normalizePoint(rawLoc) || normalizePoint(business?.location);

    const post = await Post.create({
      type: postType,
      ownerId: oid(userId),
      ownerModel: 'User',
      placeId: placeId || null,
      message: message || (req.body.reviewText || ''),
      ...(loc && { location: loc }),
      media,
      taggedUsers: postLevelTags,
      privacy: privacy || (isPublic === true ? 'public' : undefined),
      sortDate: getSortDateForType(postType, buildDetailsForType(postType, req.body)),
      details: buildDetailsForType(postType, req.body),
      shared: buildSharedSection(postType, req.body),
      refs: buildRefsSection(postType, req.body),
    });

    // ✅ enrich for client: fullName + profilePicUrl
    const [enriched, author] = await Promise.all([
      enrichPostForResponse(post.toObject()),
      User.findById(userId).select('firstName lastName profilePic').lean(),
    ]);

    const fullName = buildFullName(author);
    const profilePicUrl = await getProfilePicUrl(author);

    // keep both top-level and nested `user` for maximum compatibility with your UI
    enriched.fullName = fullName;
    enriched.profilePicUrl = profilePicUrl;
    enriched.user = {
      id: author?._id?.toString() || userId,
      firstName: author?.firstName || null,
      lastName: author?.lastName || null,
      profilePicUrl,
    };

    return res.status(201).json(enriched);
  } catch (error) {
    console.error('❌ Error creating post:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /:postType/:postId
 * Update a post of a specific type
 */
router.patch('/:postId', async (req, res) => {
  const { postId } = req.params;
  if (!isValidObjectId(postId)) {
    return res.status(400).json({ message: 'Invalid postId' });
  }

  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // derive type from the stored post
    const postType = post.type;
    if (ALLOWED_TYPES && !ALLOWED_TYPES.has(postType)) {
      return res.status(400).json({ message: 'Unsupported post type on existing post' });
    }

    // remember old state for diffing notifications
    const prevTaggedUserIds = (post.taggedUsers || []).map((id) => id.toString());
    const prevPhotos = post.media || [];

    // -------- generic fields --------
    // placeId (allow explicit null) 
    if ('placeId' in req.body) post.placeId = req.body.placeId || null;

    // privacy (accept provided value even if falsy like 'private')
    if ('privacy' in req.body) post.privacy = req.body.privacy;

    // message: accept `message`, or fall back to `reviewText` if provided
    if ('message' in req.body || 'reviewText' in req.body) {
      post.message = ('message' in req.body) ? req.body.message : (req.body.reviewText || '');
    }

    // upsert business if any location/business fields came in
    if (req.body.placeId || req.body.location || req.body.businessName) {
      await upsertBusinessIfNeeded(
        req.body.placeId ?? post.placeId,
        req.body.businessName,
        req.body.location
      );
    }

    // post-level tagged users (allow clearing via empty [])
    if ('taggedUsers' in req.body) {
      post.taggedUsers = extractTaggedUserIds(req.body.taggedUsers || []);
    }

    // media/photos (allow clearing via empty [])
    if ('photos' in req.body) {
      post.media = await buildMediaFromPhotos(req.body.photos || [], post.ownerId);
    }

    // -------- type-specific details --------
    // build from incoming body, merge only defined keys
    const detailsPatch = buildDetailsForType(postType, req.body) || {};
    if (detailsPatch && typeof detailsPatch === 'object') {
      const definedEntries = Object.entries(detailsPatch).filter(([, v]) => v !== undefined);
      post.details = { ...(post.details || {}), ...Object.fromEntries(definedEntries) };
    }

    // shared / refs updates only if relevant and provided
    if (
      postType === 'sharedPost' &&
      (req.body.originalPostId || req.body.originalOwner || req.body.originalOwnerModel || req.body.snapshot)
    ) {
      post.shared = {
        ...(post.shared || {}),
        ...buildSharedSection('sharedPost', req.body),
      };
    }

    const refsPatch = buildRefsSection(postType, req.body);
    if (refsPatch) {
      post.refs = { ...(post.refs || {}), ...refsPatch };
    }

    // refresh sortDate from updated details
    post.sortDate = getSortDateForType(postType, post.details);

    await post.save();

    // run tag-diff notifications (added/removed tags, newly tagged in photos, etc.)
    await diffAndNotifyTags({ post, prevTaggedUserIds, prevPhotos });

    const enriched = await enrichPostForResponse(post.toObject());
    return res.status(200).json(enriched);
  } catch (error) {
    console.error('🚨 Error updating post:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 Hard delete a post
 */
// DELETE /posts/:postId  (unified)
router.delete('/:postId', async (req, res) => {
  const { postId } = req.params;
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });

  try {
    const id = new mongoose.Types.ObjectId(postId);
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // remove tag notifications
    if (post.taggedUsers?.length) {
      await User.updateMany(
        { _id: { $in: post.taggedUsers } },
        { $pull: { notifications: { targetId: id } } }
      );
    }
    // remove business notifications
    if (post.placeId) {
      await Business.updateOne(
        { placeId: post.placeId },
        { $pull: { notifications: { targetId: id } } }
      );
    }

    await Post.deleteOne({ _id: id });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Error deleting post:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * GET /user/:userId
 * List posts for a user (optionally filter by type via ?type=review or ?type=review,check-in)
 */
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { type } = req.query;

  try {
    const filter = { ownerId: oid(userId) };
    if (type) {
      const types = String(type).split(',').map((t) => t.trim()).filter((t) => ALLOWED_TYPES.has(t));
      if (types.length) filter.type = { $in: types };
    }

    const posts = await Post.find(filter).sort({ sortDate: -1, _id: -1 }).lean();
    const enriched = await Promise.all(
      posts.map(async (p) => ({ ...p, media: await resolveTaggedPhotoUsers(p.media || []) }))
    );
    return res.status(200).json(enriched);
  } catch (error) {
    console.error('❌ Error retrieving posts by userId:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /by-place/:placeId
 * List posts for a place (optionally filter by type via ?type=review,promotion)
 */
router.get('/by-place/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const { type } = req.query;

  try {
    const filter = { placeId };
    if (type) {
      const types = String(type).split(',').map((t) => t.trim()).filter((t) => ALLOWED_TYPES.has(t));
      if (types.length) filter.type = { $in: types };
    }

    const posts = await Post.find(filter).sort({ sortDate: -1, _id: -1 }).lean();
    const enriched = await Promise.all(
      posts.map(async (p) => ({ ...p, media: await resolveTaggedPhotoUsers(p.media || []) }))
    );
    return res.status(200).json(enriched);
  } catch (error) {
    console.error('❌ Error retrieving posts by placeId:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
