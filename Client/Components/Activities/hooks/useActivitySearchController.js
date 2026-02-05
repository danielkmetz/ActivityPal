import { useCallback, useRef } from "react";
import { startActivitiesSearch, loadMorePlaces, loadMoreEvents } from "../../../Slices/GooglePlacesSlice";
import { milesToMeters } from "../../../functions";

const LOAD_MORE_COOLDOWN_MS = 800;

function isFiniteNum(v) {
  return Number.isFinite(Number(v));
}

export default function useActivitySearchController({
  dispatch,
  lat,
  lng,
  perPage,

  statusByStream,
  loadingMoreByStream,
  hasMoreByStream,
  lastSearch,
  onNewSearchReset,

  defaultRadiusMeters = milesToMeters(7),
  defaultDiningRadiusMeters = milesToMeters(5),
} = {}) {
  // Prevent duplicate onEndReached spam before redux state flips loadingMore=true
  const lastLoadMoreAtRef = useRef({ places: 0, events: 0 });

  const startSearch = useCallback(
    (query) => {
      // Don't use `if (!lat || !lng)` — lat/lng can be 0 in valid coords.
      if (!isFiniteNum(lat) || !isFiniteNum(lng)) return;

      if (typeof onNewSearchReset === "function") onNewSearchReset();

      const qIn = query && typeof query === "object" ? query : {};

      // Determine if this *likely* routes to dining
      const isDining =
        qIn.placeCategory === "food_drink" ||
        qIn.activityType === "Dining" ||
        qIn.quickFilter === "Dining";

      // Normalize radiusMeters robustly:
      // - prefer radiusMeters if provided
      // - else accept radius as miles and convert (legacy UI pattern)
      // - else default based on dining/non-dining
      const inRadiusMeters = Number(qIn.radiusMeters);
      const inRadiusMiles = Number(qIn.radius);

      let radiusMeters;
      if (Number.isFinite(inRadiusMeters) && inRadiusMeters > 0) {
        radiusMeters = inRadiusMeters;
      } else if (Number.isFinite(inRadiusMiles) && inRadiusMiles > 0) {
        // Treat legacy `radius` as miles (common older pattern)
        radiusMeters = milesToMeters(inRadiusMiles);
      } else {
        radiusMeters = isDining ? defaultDiningRadiusMeters : defaultRadiusMeters;
      }

      const q = {
        ...qIn,
        lat: Number(lat),
        lng: Number(lng),
        perPage: Number(qIn.perPage || perPage || 15),

        // New contract
        radiusMeters,

        // Legacy safety: keep radius populated so the dining path doesn't break.
        // If your dining endpoint expects meters, this is correct.
        // If it expects miles, then your dining endpoint is already inconsistent with your defaults.
        radius: qIn.radius ?? radiusMeters,
      };

      dispatch(startActivitiesSearch(q));
    },
    [
      dispatch,
      lat,
      lng,
      perPage,
      onNewSearchReset,
      defaultRadiusMeters,
      defaultDiningRadiusMeters,
    ]
  );

  const loadMore = useCallback(
    (stream) => {
      if (!stream) return;
      if (!lastSearch) return;

      // Hard gates first
      if (!hasMoreByStream?.[stream]) return;
      if (loadingMoreByStream?.[stream]) return;

      // Some of your code checks `status === "loading"`, but you should treat ANY loading as a block.
      const s = statusByStream?.[stream];
      if (s === "loading" || s === "loadingMore") return;

      // Cooldown gate to stop FlatList from firing multiple times back-to-back
      const now = Date.now();
      const lastAt = lastLoadMoreAtRef.current?.[stream] || 0;
      if (now - lastAt < LOAD_MORE_COOLDOWN_MS) return;
      lastLoadMoreAtRef.current[stream] = now;

      if (stream === "places") {
        dispatch(loadMorePlaces({ lastSearch }));
        return;
      }

      if (stream === "events") {
        dispatch(loadMoreEvents({ lastSearch }));
      }
    },
    [dispatch, lastSearch, statusByStream, loadingMoreByStream, hasMoreByStream]
  );

  return { startSearch, loadMore };
}
