const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const Business = require('../models/Business.js');
const User = require('../models/User.js');
const { Post } = require('../models/Post.js'); // unified model with discriminators
const { deleteS3Objects } = require('../utils/deleteS3Objects.js');
const {
  fetchUserSummaries,
  collectUserIdsFromPosts,
  enrichPostUniversal,
} = require('../utils/enrichPosts');
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
const getMediaKey = (m = {}) => m.photoKey || m.mediaKey || m.key || m.s3Key || m.Key || null;

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

function nextSortDate({ type, prevSortDate, details, body, isPatch }) {
  if (!isPatch) {
    // CREATE behavior (same as today but explicit)
    switch (type) {
      case 'review': return new Date();
      case 'check-in': return details?.date ? new Date(details.date) : new Date();
      case 'invite': return details?.dateTime ? new Date(details.dateTime) : new Date();
      case 'event': return details?.startsAt ? new Date(details.startsAt) : new Date();
      case 'promotion': return details?.startsAt ? new Date(details.startsAt) : new Date();
      case 'liveStream': return details?.startedAt ? new Date(details.startedAt) : new Date();
      default: return new Date();
    }
  }

  // PATCH behavior: only update if the time field was in the body
  switch (type) {
    case 'review':
    case 'sharedPost':
      return prevSortDate; // don’t bump reviews/shared posts on edit
    case 'check-in':
      return ('date' in body) ? new Date(details.date) : prevSortDate;
    case 'invite':
      return ('dateTime' in body) ? new Date(details.dateTime) : prevSortDate;
    case 'event':
      return ('startsAt' in body) ? new Date(details.startsAt) : prevSortDate;
    case 'promotion':
      return ('startsAt' in body) ? new Date(details.startsAt) : prevSortDate;
    case 'liveStream':
      return ('startedAt' in body) ? new Date(details.startedAt) : prevSortDate;
    default:
      return prevSortDate;
  }
}


function buildDetailsForType(type, body, { isPatch = false } = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  switch (type) {
    /* ------------------------------ REVIEW ------------------------------ */
    case 'review': {
      if (isPatch) {
        return {
          ...(has('rating') ? { rating: body.rating } : {}),
          ...(has('reviewText') ? { reviewText: body.reviewText } : {}),
          ...(has('priceRating') ? { priceRating: body.priceRating } : {}),
          ...(has('atmosphereRating') ? { atmosphereRating: body.atmosphereRating } : {}),
          ...(has('serviceRating') ? { serviceRating: body.serviceRating } : {}),
          ...(has('wouldRecommend') ? { wouldRecommend: body.wouldRecommend } : {}),
          ...(has('fullName') ? { fullName: body.fullName } : {}),
        };
      }
      // create
      return {
        rating: body.rating,
        reviewText: body.reviewText,
        priceRating: body.priceRating ?? null,
        atmosphereRating: body.atmosphereRating ?? null,
        serviceRating: body.serviceRating ?? null,
        wouldRecommend: body.wouldRecommend ?? null,
        fullName: body.fullName,
      };
    }
    /* ----------------------------- CHECK-IN ----------------------------- */
    case 'check-in': {
      if (isPatch) {
        // Only change the date if the client sent it (prevents accidental "now" bumps).
        return has('date') ? { date: body.date } : {};
      }
      // create: default to now if not provided
      return { date: body.date || new Date() };
    }
    /* ------------------------------ INVITE ------------------------------ */
    case 'invite': {
      const mapRecipients = (arr = []) =>
        arr.map((r) => ({
          userId: r.userId ? oid(r.userId) : undefined,
          status: r.status || 'pending',
        }));

      const mapRequests = (arr = []) =>
        arr.map((rq) => ({
          userId: rq.userId ? oid(rq.userId) : undefined,
          status: rq.status || 'pending',
          requestedAt: rq.requestedAt ? new Date(rq.requestedAt) : new Date(),
        }));

      if (isPatch) {
        return {
          ...(has('dateTime') ? { dateTime: body.dateTime } : {}),
          ...(has('recipients') ? { recipients: mapRecipients(body.recipients) } : {}),
          ...(has('requests') ? { requests: mapRequests(body.requests) } : {}),
        };
      }
      // create
      return {
        dateTime: body.dateTime,
        recipients: mapRecipients(body.recipients || []),
        requests: mapRequests(body.requests || []),
      };
    }
    /* ------------------------------- EVENT ------------------------------ */
    case 'event': {
      if (isPatch) {
        return {
          ...(has('startsAt') ? { startsAt: body.startsAt } : {}),
          ...(has('endsAt') ? { endsAt: body.endsAt } : {}),
          ...(has('hostId') ? { hostId: body.hostId ? oid(body.hostId) : null } : {}),
        };
      }
      // create
      return {
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        hostId: body.hostId ? oid(body.hostId) : undefined,
      };
    }
    /* ----------------------------- PROMOTION ---------------------------- */
    case 'promotion': {
      if (isPatch) {
        return {
          ...(has('startsAt') ? { startsAt: body.startsAt } : {}),
          ...(has('endsAt') ? { endsAt: body.endsAt } : {}),
          ...(has('discountPct') ? { discountPct: body.discountPct } : {}),
          ...(has('code') ? { code: body.code } : {}),
        };
      }
      // create
      return {
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        discountPct: body.discountPct,
        code: body.code,
      };
    }
    /* ---------------------------- SHARED POST --------------------------- */
    case 'sharedPost': {
      // Shared post domain fields (if any) can live here. Keep behavior symmetric.
      if (isPatch) {
        return has('sharedDetails') ? (body.sharedDetails || {}) : {};
      }
      return body.sharedDetails || {};
    }
    /* ----------------------------- LIVE STREAM -------------------------- */
    case 'liveStream': {
      if (isPatch) {
        return {
          ...(has('title') ? { title: body.title } : {}),
          ...(has('status') ? { status: body.status } : {}),
          ...(has('coverKey') ? { coverKey: body.coverKey } : {}),
          ...(has('durationSec') ? { durationSec: body.durationSec } : {}),
          ...(has('viewerPeak') ? { viewerPeak: body.viewerPeak } : {}),
          ...(has('startedAt') ? { startedAt: body.startedAt } : {}),
          ...(has('endedAt') ? { endedAt: body.endedAt } : {}),
        };
      }
      // create
      return {
        title: body.title || '',
        status: body.status || 'idle',
        coverKey: body.coverKey || null,
        durationSec: body.durationSec,
        viewerPeak: body.viewerPeak || 0,
        startedAt: body.startedAt,
        endedAt: body.endedAt,
      };
    }
    /* ------------------------------ DEFAULT ----------------------------- */
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

/** Small helper to enrich one or many posts like the resolvers do */
async function enrichPostForResponse(postOrPosts) {
  const arr = Array.isArray(postOrPosts) ? postOrPosts : [postOrPosts];
  const userIds = collectUserIdsFromPosts(arr);
  const userMap = await fetchUserSummaries(userIds);
  const enriched = await Promise.all(arr.map((p) => enrichPostUniversal(p, userMap)));
  return Array.isArray(postOrPosts) ? enriched : enriched[0];
}

/** (optional) attach businessName like your GQL field resolver */
async function attachBusinessNameIfMissing(post) {
  if (post.businessName || !post.placeId) return post;
  const biz = await Business.findOne({ placeId: post.placeId }).select('businessName').lean();
  if (biz?.businessName) post.businessName = biz.businessName;
  return post;
}

// ======================= ROUTES =======================

/**
 * GET /:postType/:postId
 * Fetch a single post of a specific type
 */
router.get('/:postId', async (req, res) => {
  const { postId } = req.params;
  const postType = req.query.type || req.params.postType || req.body?.type || req.body?.postType;

  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });
  if (postType && !ALLOWED_TYPES.has(postType)) {
    return res.status(400).json({ message: 'Unsupported postType' });
  }

  try {
    const match = { _id: postId };
    if (postType) match.type = postType;

    const doc = await Post.findOne(match).lean();
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    await attachBusinessNameIfMissing(doc);
    const enriched = await enrichPostForResponse(doc);
    return res.status(200).json(enriched);
  } catch (err) {
    console.error('[GET /posts/:postId] ❌', err?.message);
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

/**
 * POST /:postType
 * Create a post of a specific type
 */
router.post('/', async (req, res) => {
  const postType = req.body.type || req.body.postType;
  if (!ALLOWED_TYPES.has(postType)) {
    return res.status(400).json({ message: 'Unsupported postType' });
  }

  try {
    // (Your existing creation pipeline)
    const {
      userId, placeId, location: rawLoc, businessName, privacy, isPublic,
      message, photos, taggedUsers,
    } = req.body;

    const business = await upsertBusinessIfNeeded(placeId, businessName, req.body.location);
    const media = await buildMediaFromPhotos(photos || [], userId);
    const postLevelTags = extractTaggedUserIds(taggedUsers);
    const loc = normalizePoint(rawLoc) || normalizePoint(business?.location);

    const post = await Post.create({
      type: postType,
      ownerId: userId,               // mongoose will cast
      ownerModel: 'User',
      businessName: businessName || '',
      placeId: placeId || null,
      message: message || req.body.reviewText || '',
      ...(loc && { location: loc }),
      media,
      taggedUsers: postLevelTags,
      privacy: privacy || (isPublic === true ? 'public' : undefined),
      sortDate: getSortDateForType(postType, buildDetailsForType(postType, req.body)),
      details: buildDetailsForType(postType, req.body),
      shared: buildSharedSection(postType, req.body),
      refs: buildRefsSection(postType, req.body),
    });

    const raw = post.toObject();
    await attachBusinessNameIfMissing(raw);
    const enriched = await enrichPostForResponse(raw);

    // No need to manually set fullName/profilePicUrl — enrichPostUniversal does that
    return res.status(201).json(enriched);
  } catch (err) {
    console.error('[POST /posts] ❌', err?.message);
    return res.status(500).json({ message: 'Server error', error: err?.message });
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

  ['createdAt','updatedAt','_id','__v'].forEach(k => delete req.body[k]);

  try {
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const postType = post.type;
    if (ALLOWED_TYPES && !ALLOWED_TYPES.has(postType)) {
      return res.status(400).json({ message: 'Unsupported post type on existing post' });
    }

    // snapshots for diffs
    const prevTaggedUserIds = (post.taggedUsers || []).map(String);
    const prevPhotos = post.media || [];

    // -------- generic fields --------
    if ('placeId' in req.body) post.placeId = req.body.placeId || null;
    if ('privacy' in req.body) post.privacy = req.body.privacy;
    if ('message' in req.body || 'reviewText' in req.body) {
      post.message = ('message' in req.body) ? req.body.message : (req.body.reviewText || '');
    }
    if (req.body.placeId || req.body.location || req.body.businessName) {
      await upsertBusinessIfNeeded(
        req.body.placeId ?? post.placeId,
        req.body.businessName,
        req.body.location
      );
    }
    if ('taggedUsers' in req.body) {
      post.taggedUsers = extractTaggedUserIds(req.body.taggedUsers || []);
    }

    // Build next media (but don't delete from S3 yet)
    let keysToDelete = [];
    if ('photos' in req.body) {
      const nextMedia = await buildMediaFromPhotos(req.body.photos || [], post.ownerId);

      // diff keys (prev − next)
      const prevKeys = new Set(prevPhotos.map(getMediaKey).filter(Boolean));
      const nextKeys = new Set(nextMedia.map(getMediaKey).filter(Boolean));
      keysToDelete = [...prevKeys].filter(k => !nextKeys.has(k));

      post.media = nextMedia;
    }

    // -------- type-specific --------
    const detailsPatch = buildDetailsForType(postType, req.body, { isPatch: true }) || {};
    if (detailsPatch && typeof detailsPatch === 'object') {
      const defined = Object.fromEntries(Object.entries(detailsPatch).filter(([, v]) => v !== undefined));
      post.details = { ...(post.details || {}), ...defined };
    }

    if (
      postType === 'sharedPost' &&
      (req.body.originalPostId || req.body.originalOwner || req.body.originalOwnerModel || req.body.snapshot)
    ) {
      post.shared = { ...(post.shared || {}), ...buildSharedSection('sharedPost', req.body) };
    }

    const refsPatch = buildRefsSection(postType, req.body);
    if (refsPatch) post.refs = { ...(post.refs || {}), ...refsPatch };

    post.sortDate = nextSortDate({
      type: postType,
      prevSortDate: post.sortDate,
      details: post.details,
      body: req.body,
      isPatch: true,
    });

    // persist first
    await post.save();

    // tag add/remove notifications
    await diffAndNotifyTags({ post, prevTaggedUserIds, prevPhotos });

    // delete removed media from S3 (best-effort AFTER successful save)
    if (keysToDelete.length) {
      try {
        await deleteS3Objects(keysToDelete);
      } catch (e) {
        console.error('⚠️ S3 delete (patch) failed for keys:', keysToDelete, e);
      }
    }

    // -------- enrich using helpers --------
    const raw = post.toObject();

    // collect all posts we might need user summaries for (top-level + nested)
    const toScan = [raw];
    if (raw?.original) toScan.push(raw.original);
    if (raw?.shared?.snapshot) toScan.push(raw.shared.snapshot);

    const userIds = collectUserIdsFromPosts(toScan);
    const userMap = await fetchUserSummaries(userIds);

    // enrich top-level
    const enriched = await enrichPostUniversal(raw, userMap);

    // optionally enrich nested original (shared post) and/or shared.snapshot
    if (raw?.original) {
      enriched.original = await enrichPostUniversal(raw.original, userMap);
    }
    if (raw?.shared?.snapshot) {
      enriched.shared = {
        ...(enriched.shared || raw.shared || {}),
        snapshot: await enrichPostUniversal(raw.shared.snapshot, userMap),
      };
    }

    return res.status(200).json(enriched);
  } catch (error) {
    console.error('🚨 Error updating post:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

/**
 Hard delete a post
 */
router.delete('/:postId', async (req, res) => {
  const { postId } = req.params;
  if (!isValidObjectId(postId)) return res.status(400).json({ message: 'Invalid postId' });

  try {
    const id = new mongoose.Types.ObjectId(postId);
    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // collect keys BEFORE removing the document
    const keys = (post.media || []).map(getMediaKey).filter(Boolean);

    // remove notifications
    if (post.taggedUsers?.length) {
      await User.updateMany(
        { _id: { $in: post.taggedUsers } },
        { $pull: { notifications: { targetId: id } } }
      );
    }
    if (post.placeId) {
      await Business.updateOne(
        { placeId: post.placeId },
        { $pull: { notifications: { targetId: id } } }
      );
    }

    await Post.deleteOne({ _id: id });

    // best-effort S3 cleanup
    if (keys.length) {
      try {
        await deleteS3Objects(keys);
      } catch (e) {
        console.error('⚠️ S3 delete (hard delete) failed for keys:', keys, e);
      }
    }

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
