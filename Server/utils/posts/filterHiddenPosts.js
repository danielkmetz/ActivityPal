const mongoose = require('mongoose');
const HiddenPost = require('../../models/HiddenPosts'); // ⬅️ adjust relative path

const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v));
const toOid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Load ALL hidden rows for a viewer and bucket them by what they point to.
 *
 * - posts:    Post._id for review/check-in/invite/sharedPost/liveStream
 * - events:   Event._id
 * - promotions: Promotion._id
 */
async function getViewerHiddenIdSets(viewerId) {
  if (!viewerId || !isOid(viewerId)) {
    return {
      posts: new Set(),
      events: new Set(),
      promotions: new Set(),
    };
  }

  const viewerOid = toOid(viewerId);

  const rows = await HiddenPost.find(
    { userId: viewerOid },
    { targetId: 1, targetRef: 1, _id: 0 }
  ).lean();

  const posts = new Set();
  const events = new Set();
  const promotions = new Set();

  for (const r of rows) {
    const id = String(r.targetId);
    switch (r.targetRef) {
      case 'review':
      case 'check-in':
      case 'invite':
      case 'sharedPost':
      case 'liveStream':
        posts.add(id);
        break;
      case 'event':
        events.add(id);
        break;
      case 'promotion':
        promotions.add(id);
        break;
      default:
        // ignore unknown targetRef
        break;
    }
  }

  return { posts, events, promotions };
}

/**
 * Filter out Post documents (review/check-in/invite/sharedPost/liveStream)
 * whose Post._id is globally hidden for this viewer.
 *
 * `posts` is an array of Post docs or lean objects.
 */
async function filterHiddenPosts(posts, viewerId, opts = {}) {
  const { debugTag = '[filterHiddenPostsForViewer]', log = false } = opts;

  if (!Array.isArray(posts) || posts.length === 0) return posts;
  if (!viewerId) return posts; // anon viewer → nothing to hide

  const { posts: hiddenPosts } = await getViewerHiddenIdSets(viewerId);

  if (!hiddenPosts.size) {
    if (log) {
      console.log(debugTag, 'no hidden posts for viewer', { viewerId: String(viewerId) });
    }
    return posts;
  }

  const filtered = posts.filter((p) => p && !hiddenPosts.has(String(p._id)));

  if (log) {
    console.log(debugTag, 'filtered post feed for viewer', {
      viewerId: String(viewerId),
      beforeCount: posts.length,
      afterCount: filtered.length,
      hiddenCount: hiddenPosts.size,
      hiddenSample: Array.from(hiddenPosts).slice(0, 10),
    });
  }

  return filtered;
}

async function filterHiddenEventsAndPromotions(events, promotions, viewerId, opts = {}) {
  const { debugTag = '[filterHiddenEventsAndPromotions]', log = false } = opts;

  // Nothing to do if no viewer or no items
  const hasEvents = Array.isArray(events) && events.length > 0;
  const hasPromos = Array.isArray(promotions) && promotions.length > 0;

  if (!viewerId || (!hasEvents && !hasPromos)) {
    return { events, promotions };
  }

  const { events: hiddenEvents, promotions: hiddenPromos } =
    await getViewerHiddenIdSets(viewerId);

  let filteredEvents = events;
  let filteredPromotions = promotions;

  if (hasEvents && hiddenEvents.size) {
    filteredEvents = events.filter(
      (e) => e && !hiddenEvents.has(String(e._id))
    );

    if (log) {
      console.log(`${debugTag} [events]`, {
        viewerId: String(viewerId),
        beforeCount: events.length,
        afterCount: filteredEvents.length,
        hiddenCount: hiddenEvents.size,
        hiddenSample: Array.from(hiddenEvents).slice(0, 10),
      });
    }
  } else if (log && hasEvents) {
    console.log(`${debugTag} [events] no hidden events for viewer`, {
      viewerId: String(viewerId),
    });
  }

  if (hasPromos && hiddenPromos.size) {
    filteredPromotions = promotions.filter(
      (p) => p && !hiddenPromos.has(String(p._id))
    );

    if (log) {
      console.log(`${debugTag} [promotions]`, {
        viewerId: String(viewerId),
        beforeCount: promotions.length,
        afterCount: filteredPromotions.length,
        hiddenCount: hiddenPromos.size,
        hiddenSample: Array.from(hiddenPromos).slice(0, 10),
      });
    }
  } else if (log && hasPromos) {
    console.log(`${debugTag} [promotions] no hidden promos for viewer`, {
      viewerId: String(viewerId),
    });
  }

  return {
    events: filteredEvents,
    promotions: filteredPromotions,
  };
}

/**
 * Filter out Event docs whose Event._id is globally hidden for this viewer.
 *
 * `events` is an array of Event docs/lean objects (the ones from your
 * Events collection, e.g. in /events-and-promos-nearby).
 */
async function filterHiddenEvents(events, viewerId, opts = {}) {
  const { events: filtered } = await filterHiddenEventsAndPromotions(
    events,
    [],
    viewerId,
    { ...opts, debugTag: opts.debugTag || '[filterHiddenEventsForViewer]' }
  );
  return filtered;
}

/**
 * Filter out Promotion docs whose Promotion._id is globally hidden for this viewer.
 *
 * `promotions` is an array of Promotion docs/lean objects (from your
 * Promotions collection, e.g. in /events-and-promos-nearby).
 */
async function filterHiddenPromotions(promotions, viewerId, opts = {}) {
  const { promotions: filtered } = await filterHiddenEventsAndPromotions(
    [],
    promotions,
    viewerId,
    { ...opts, debugTag: opts.debugTag || '[filterHiddenPromotionsForViewer]' }
  );
  return filtered;
}

module.exports = {
  getViewerHiddenIdSets,
  filterHiddenPosts,
  filterHiddenEvents,
  filterHiddenPromotions,
  filterHiddenEventsAndPromotions,
};
