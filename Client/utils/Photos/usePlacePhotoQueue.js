import { useCallback, useEffect, useRef } from "react";
import { resolvePlacePhotos } from "../../Slices/GooglePlacesSlice";

/**
 * Photo prefetch queue for Places cards.
 *
 * Expects each list item to have:
 * - item.photoName (string)  -> the identifier you send to resolvePlacePhotos
 * - item.photoUrl (string?)  -> if already resolved, we skip
 *
 * Usage:
 * const { viewabilityConfig, onViewableItemsChanged, resetPhotoQueue } = usePlacePhotoQueue({ dispatch });
 */
export default function usePlacePhotoQueue({
  dispatch,
  maxWidth = 400,
  debounceMs = 150,
  batchSize = 50,
  maxEnqueuePerPass = 30,
  itemVisiblePercentThreshold = 60,
  minimumViewTime = 200,
  log = console.log,
} = {}) {
  const photoQueueRef = useRef(new Map()); // name -> maxWidth
  const photoFlushTimerRef = useRef(null);
  const photoInFlightRef = useRef(false);

  // Avoid callback dependency knot / TDZ foot-guns by using refs.
  const flushRef = useRef(null);
  const scheduleRef = useRef(null);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold,
    minimumViewTime,
  }).current;

  const resetPhotoQueue = useCallback(() => {
    photoQueueRef.current = new Map();
    photoInFlightRef.current = false;

    if (photoFlushTimerRef.current) {
      clearTimeout(photoFlushTimerRef.current);
      photoFlushTimerRef.current = null;
    }
  }, []);

  const flushPhotoQueue = useCallback(async () => {
    if (photoInFlightRef.current) return;

    const entries = Array.from(photoQueueRef.current.entries());
    if (!entries.length) return;

    const batch = entries.slice(0, batchSize);
    batch.forEach(([name]) => photoQueueRef.current.delete(name));

    photoInFlightRef.current = true;
    try {
      const action = dispatch(
        resolvePlacePhotos({
          photos: batch.map(([name, max]) => ({ name, max })),
        })
      );

      // RTK thunk: prefer unwrap(), fallback to awaiting the action
      if (action && typeof action.unwrap === "function") {
        await action.unwrap();
      } else {
        await action;
      }
    } catch (e) {
      // Don’t requeue automatically. If you want retries, do it explicitly with backoff + max attempts.
      log("resolvePlacePhotos failed (dropping batch)", {
        error: e?.message || String(e),
        count: batch.length,
      });
    } finally {
      photoInFlightRef.current = false;
    }

    // If more queued, schedule another flush (don’t recurse immediately)
    if (photoQueueRef.current.size) {
      scheduleRef.current && scheduleRef.current();
    }
  }, [dispatch, batchSize, log]);

  const schedulePhotoFlush = useCallback(() => {
    if (photoFlushTimerRef.current) return;

    photoFlushTimerRef.current = setTimeout(() => {
      photoFlushTimerRef.current = null;
      flushRef.current && flushRef.current();
    }, debounceMs);
  }, [debounceMs]);

  // Keep refs pointed at latest callbacks (stable call sites).
  useEffect(() => {
    flushRef.current = flushPhotoQueue;
    scheduleRef.current = schedulePhotoFlush;
  }, [flushPhotoQueue, schedulePhotoFlush]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (photoFlushTimerRef.current) {
        clearTimeout(photoFlushTimerRef.current);
        photoFlushTimerRef.current = null;
      }
    };
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    let added = 0;

    for (const v of viewableItems || []) {
      const item = v?.item;
      if (!item) continue;

      const name = item?.photoName;
      if (!name) continue;

      // already resolved? skip
      if (item?.photoUrl) continue;

      if (!photoQueueRef.current.has(name)) {
        photoQueueRef.current.set(name, maxWidth);
        added += 1;
      }

      if (added >= maxEnqueuePerPass) break;
    }

    if (added > 0) {
      scheduleRef.current && scheduleRef.current();
    }
  }).current;

  return {
    viewabilityConfig,
    onViewableItemsChanged,
    resetPhotoQueue,
    // optional debug helpers
    getQueueSize: () => photoQueueRef.current.size,
    flushNow: () => flushRef.current && flushRef.current(),
  };
}
