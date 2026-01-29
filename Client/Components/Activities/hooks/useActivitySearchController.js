import { useCallback } from "react";
import {
  startActivitiesSearch,
  loadMorePlaces,
  loadMoreEvents,
} from "../../../Slices/GooglePlacesSlice";
import { milesToMeters } from "../../../functions";

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

  // ✅ defaults
  defaultRadiusMeters = milesToMeters(7),
  defaultDiningRadiusMeters = milesToMeters(5),
} = {}) {
  const startSearch = useCallback(
    (query) => {
      if (!lat || !lng) return;

      if (typeof onNewSearchReset === "function") onNewSearchReset();

      const qIn = query && typeof query === "object" ? query : {};

      // Determine if this search should use dining pipeline
      const isDining =
        qIn.placeCategory === "food_drink" ||
        qIn.activityType === "Dining" ||
        qIn.quickFilter === "Dining";

      const radiusMeters =
        Number(qIn.radius ?? qIn.radiusMeters) ||
        (isDining ? defaultDiningRadiusMeters : defaultRadiusMeters);

      // ✅ enforce canonical defaults
      const q = {
        ...qIn,
        lat,
        lng,
        perPage: qIn.perPage || perPage,
        radius: radiusMeters, // backend expects `radius` (meters) in your new flow
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

      if (statusByStream?.[stream] === "loading") return;
      if (loadingMoreByStream?.[stream]) return;
      if (!hasMoreByStream?.[stream]) return;

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
