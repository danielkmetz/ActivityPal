const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { isValidObjectId } = require('mongoose');
const Business = require('../models/Business.js');
const User = require('../models/User.js');
const { Post } = require('../models/Post.js'); // unified model with discriminators
const deleteS3Objects = require('../utils/deleteS3Objects.js');
const { normalizePoint } = require('../utils/posts/normalizePoint.js');
const { getPresignedUrl } = require('../utils/cachePresignedUrl.js');
const { hydratePostForResponse } = require('../utils/posts/hydrateAndEnrichForResponse.js');
const { extractTaggedUserIds } = require('../utils/enrichPosts');
const { clearOldestNeedsRecapNotification } = require('../utils/posts/removeRecapNotification.js');

// -------------------- constants --------------------
const ALLOWED_TYPES = new Set([
  'review',
  'post',
  'check-in',
  'invite',
  'event',
  'promotion',
  'sharedPost',
]);

// -------------------- helpers --------------------
const oid = (v) => (isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : v);
const getMediaKey = (m = {}) => m.photoKey || m.mediaKey || m.key || m.s3Key || m.Key || null;
const isValidPoint = p =>
  !!p && p.type === 'Point' &&
  Array.isArray(p.coordinates) &&
  p.coordinates.length === 2 &&
  p.coordinates.every(Number.isFinite);

const isNullIsland = p => isValidPoint(p) && p.coordinates[0] === 0 && p.coordinates[1] === 0;

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

function getSortDateForType(/* type, details */) {
  // Always sort by creation-time; for a new post, that's "now".
  return new Date();
}

function nextSortDate({ prevSortDate }) {
  // Never change sortDate on edit – keep original creation-time ordering.
  return prevSortDate || new Date();
}

function normalizeVibeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean);
  // de-dupe and clamp to 3
  return [...new Set(cleaned)].slice(0, 3);
}

function buildDetailsForType(type, body, { isPatch = false } = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  switch (type) {
    /* ------------------------------ REVIEW ------------------------------ */
    case 'review': {
      if (isPatch) {
        const patch = {};

        if (has('rating')) {
          patch.rating = body.rating;
        }

        if (has('wouldGoBack')) {
          patch.wouldGoBack = body.wouldGoBack;
        }

        // Keep review text in sync with either reviewText OR message
        if (has('reviewText') || has('message')) {
          const text = has('reviewText') ? body.reviewText : body.message;
          patch.reviewText =
            typeof text === 'string' ? text : '';
        }

        if (has('priceRating')) {
          patch.priceRating = body.priceRating ?? null;
        }

        if (has('vibeTags')) {
          patch.vibeTags = normalizeVibeTags(body.vibeTags);
        }

        if (has('fullName')) {
          patch.fullName = body.fullName;
        }

        return patch;
      }

      // create path
      const rating = body.rating;
      const wouldGoBack = body.wouldGoBack;

      // you can let Mongoose enforce required, but this is where you'd 400 if you want:
      // if (rating == null) throw new Error('rating is required');
      // if (typeof wouldGoBack !== 'boolean') throw new Error('wouldGoBack is required');

      const textSource =
        typeof body.reviewText === 'string' && body.reviewText.trim().length
          ? body.reviewText
          : typeof body.message === 'string'
            ? body.message
            : '';

      return {
        rating,
        wouldGoBack,
        reviewText: textSource,
        priceRating: body.priceRating ?? null,
        vibeTags: normalizeVibeTags(body.vibeTags),
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
    /* ------------------------------ DEFAULT ----------------------------- */
    default:
      return {};
  }
}

function buildSharedSection(type, body) {
  if (type !== 'sharedPost') return undefined;

  const hasOriginalId = !!body.originalPostId;
  const hasSnapshot = !!body.snapshot;

  // You can tweak this rule, but this is a sane default:
  if (!hasOriginalId && !hasSnapshot) {
    throw new Error('sharedPost requires originalPostId or snapshot');
  }

  return {
    ...(hasOriginalId ? { originalPostId: oid(body.originalPostId) } : {}),
    originalOwner: body.originalOwner ? oid(body.originalOwner) : undefined,
    originalOwnerModel: body.originalOwnerModel || 'User',
    snapshot: hasSnapshot ? body.snapshot : undefined,

    // optional: track original type/kind if you send it from the client
    originalType: body.originalType || undefined,   // e.g. 'promotion' | 'event'
    originalKind: body.originalKind || undefined,   // e.g. 'promotion' | 'event' | 'review'
  };
}

function buildRefsSection(type, body) {
  const refs = {};

  // 🔹 Recap relationship: review/check-in referring back to an invite
  // Prefer top-level relatedInviteId; fall back to body.refs.relatedInviteId if present
  const rawRelated =
    body.relatedInviteId != null
      ? body.relatedInviteId
      : body?.refs?.relatedInviteId ?? null;

  if (rawRelated) {
    refs.relatedInviteId = oid(rawRelated);
  }

  return Object.keys(refs).length ? refs : undefined;
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

/** Attach businessName + businessLogoUrl for posts/promos/events/snapshots */
async function attachBusinessNameIfMissing(post) {
  if (!post) return post;

  // Try to derive a placeId from multiple shapes (top-level, original, snapshot, details)
  const placeId =
    post.placeId ||
    post.details?.placeId ||
    post.details?.place?.placeId ||
    post.shared?.snapshot?.placeId ||
    post.original?.placeId ||
    post.original?.details?.placeId ||
    null;

  if (!placeId) return post;

  const needsName = !post.businessName;
  const needsLogo = !post.businessLogoUrl;

  // If nothing is missing, skip DB hit
  if (!needsName && !needsLogo) return post;

  // Pull fields we care about – adjust to match your Business schema
  const biz = await Business.findOne({ placeId })
    .select('businessName businessLogo logo profilePic')
    .lean();

  if (!biz) return post;

  if (needsName && biz.businessName) {
    post.businessName = biz.businessName;
  }

  if (needsLogo) {
    const logoKey =
      biz.businessLogo?.photoKey ||
      biz.logo?.photoKey ||
      biz.profilePic?.photoKey ||
      null;

    if (logoKey) {
      try {
        post.businessLogoUrl = await getPresignedUrl(logoKey);
      } catch (e) {
        console.error('[attachBusinessNameIfMissing] Failed to sign logo key', {
          placeId,
          error: e?.message,
        });
      }
    }
  }

  return post;
}

// ======================= ROUTES =======================

/**
 * GET /:postType/:postId
 * Fetch a single post of a specific type
 */
router.get('/:postId', async (req, res) => {
  const { postId } = req.params;

  const rawType =
    req.query.type || req.params.postType || req.body?.type || req.body?.postType;
  const postType = rawType ? String(rawType).trim() : null;

  if (!isValidObjectId(postId)) {
    return res.status(400).json({ message: 'Invalid postId' });
  }

  if (postType && !ALLOWED_TYPES.has(postType)) {
    return res.status(400).json({ message: 'Unsupported postType' });
  }

  try {
    const match = { _id: postId };

    // If "post" is your generic / catch-all, don’t over-constrain:
    if (postType && postType !== 'post') {
      match.type = postType;
    }

    const doc = await Post.findOne(match).lean();
    if (!doc) return res.status(404).json({ message: 'Post not found' });

    const viewerId =
      req.user?.id || req.user?._id?.toString?.() || req.user?.userId || null;

    const enriched = await hydratePostForResponse(doc, {
      viewerId,
      attachBusinessNameIfMissing,
    });
    return res.status(200).json(enriched);
  } catch (err) {
    console.error('[GET /posts/:postId] ❌', {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
    });
    return res.status(500).json({ message: 'Server error', error: err?.message });
  }
});

router.post('/', async (req, res) => {
  const postType = req.body?.type || req.body?.postType;

  if (!ALLOWED_TYPES.has(postType)) {
    return res.status(400).json({ message: 'Unsupported postType' });
  }

  try {
    const {
      userId,
      placeId,
      location: rawLoc,
      businessName,
      privacy,
      isPublic,
      message,
      photos,
      taggedUsers,
    } = req.body;

    const locFromBody = normalizePoint(rawLoc);

    const business = placeId
      ? await upsertBusinessIfNeeded(placeId, businessName, req.body.location)
      : null;

    const locFromBusiness = normalizePoint(business?.location);
    const locCandidate = locFromBody || (placeId ? locFromBusiness : null);

    const media = await buildMediaFromPhotos(photos || [], userId);
    const postLevelTags = extractTaggedUserIds(taggedUsers);
    const details = buildDetailsForType(postType, req.body);
    const sortDate = getSortDateForType(postType, details);

    const sharedSection = buildSharedSection(postType, req.body);
    const refsSection = buildRefsSection(postType, req.body);

    // relatedInviteId can come directly or via refs
    const relatedInviteIdRaw =
      req.body?.relatedInviteId ||
      req.body?.refs?.relatedInviteId ||
      refsSection?.relatedInviteId ||
      null;

    const doc = {
      type: postType,
      ownerId: userId,
      ownerModel: 'User',
      businessName: businessName || '',
      placeId: placeId || null,
      message: message || req.body.reviewText || '',
      media,
      taggedUsers: postLevelTags,
      privacy: privacy || (isPublic === true ? 'public' : undefined),
      sortDate,
      details,
      shared: sharedSection,
      refs: refsSection,
    };

    if (isValidPoint(locCandidate) && !isNullIsland(locCandidate)) {
      doc.location = locCandidate;
    }

    const post = await Post.create(doc);

    const postPlaceId = post.placeId || doc.placeId;

    const SHOULD_CLEAR_RECAP = postType === 'review' || postType === 'check-in';

    if (SHOULD_CLEAR_RECAP && postPlaceId) {
      try {
        await clearOldestNeedsRecapNotification({
          userId,
          createdPostId: post._id,
          placeId: postPlaceId,
          postTime: post.sortDate || post.createdAt,
          relatedInviteIdRaw,
        });
      } catch (e) {
        // If you won’t log, at least report:
        // Sentry.captureException(e);
      }
    }

    const raw = post.toObject();

    const enriched = await hydratePostForResponse(raw, {
      viewerId: userId,
      attachBusinessNameIfMissing,
    });

    return res.status(201).json(enriched);
  } catch (err) {
    return res
      .status(500)
      .json({ message: 'Server error', error: err?.message || 'Unknown error' });
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

  // strip system fields
  ['createdAt', 'updatedAt', '_id', '__v'].forEach(k => delete req.body[k]);

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

    // ---------- generic fields ----------
    if ('placeId' in req.body) post.placeId = req.body.placeId || null;
    if ('privacy' in req.body) post.privacy = req.body.privacy;

    if ('message' in req.body || 'reviewText' in req.body) {
      post.message = ('message' in req.body) ? req.body.message : (req.body.reviewText || '');
    }

    // Upsert business if any business-related fields changed
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

    // ---------- media (diff keys AFTER we compute next media) ----------
    let keysToDelete = [];
    if ('photos' in req.body) {
      const nextMedia = await buildMediaFromPhotos(req.body.photos || [], post.ownerId);
      const prevKeys = new Set((prevPhotos || []).map(getMediaKey).filter(Boolean));
      const nextKeys = new Set(nextMedia.map(getMediaKey).filter(Boolean));
      keysToDelete = [...prevKeys].filter(k => !nextKeys.has(k));
      post.media = nextMedia;
    }

    // ---------- location (strict sanitize) ----------
    const clientSentLocation = Object.prototype.hasOwnProperty.call(req.body, 'location');

    if (clientSentLocation) {
      const normalized = normalizePoint(req.body.location);
      if (normalized) {
        post.location = normalized; // { type:'Point', coordinates:[lng,lat] }
      } else if (req.body.location === null || req.body.location === '' || req.body.location === false) {
        post.set('location', undefined); // explicit unset
      }
      // else: ignore junk and keep existing
    } else if ('placeId' in req.body && req.body.placeId) {
      // placeId changed but no location provided — try Business.location
      const biz = await Business.findOne({ placeId: req.body.placeId }).select('location').lean();
      const fromBiz = normalizePoint(biz?.location);
      if (fromBiz) post.location = fromBiz;
      // (optional) if you treat [0,0] as unknown, skip assigning when coords are [0,0]
      // if (fromBiz && !(fromBiz.coordinates[0] === 0 && fromBiz.coordinates[1] === 0)) post.location = fromBiz;
    }

    // ---------- type-specific "details" patch ----------
    const detailsPatch = buildDetailsForType(postType, req.body, { isPatch: true }) || {};
    if (detailsPatch && typeof detailsPatch === 'object') {
      const defined = Object.fromEntries(Object.entries(detailsPatch).filter(([, v]) => v !== undefined));
      post.details = { ...(post.details || {}), ...defined };
    }

    // ---------- sharedPost patch (non-throwing) ----------
    if (
      postType === 'sharedPost' &&
      ('originalPostId' in req.body || 'originalOwner' in req.body || 'originalOwnerModel' in req.body || 'snapshot' in req.body)
    ) {
      post.shared = { ...(post.shared || {}) };
      if ('originalPostId' in req.body) {
        post.shared.originalPostId = req.body.originalPostId ? oid(req.body.originalPostId) : undefined;
      }
      if ('originalOwner' in req.body) {
        post.shared.originalOwner = req.body.originalOwner ? oid(req.body.originalOwner) : undefined;
      }
      if ('originalOwnerModel' in req.body) {
        post.shared.originalOwnerModel = req.body.originalOwnerModel || 'User';
      }
      if ('snapshot' in req.body) {
        post.shared.snapshot = req.body.snapshot; // allow replace/remove (undefined) snapshot
      }
    }

    // ---------- refs patch ----------
    const refsPatch = buildRefsSection(postType, req.body);
    if (refsPatch) post.refs = { ...(post.refs || {}), ...refsPatch };

    // ---------- sortDate ----------
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

    // best-effort S3 cleanup AFTER successful save
    if (keysToDelete.length) {
      try {
        await deleteS3Objects(keysToDelete);
      } catch (e) {
        console.error('⚠️ S3 delete (patch) failed for keys:', keysToDelete, e);
      }
    }

    // ---------- build response: hydrate + enrich in one pass ----------
    const raw = post.toObject();
    const enriched = await hydratePostForResponse(raw, {
      viewerId: req.user?.id,
      attachBusinessNameIfMissing,
    });
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

module.exports = router;
