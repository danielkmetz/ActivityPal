import { useCallback, useMemo } from "react";
import { fetchGooglePlaces, fetchDining, clearGooglePlaces } from "../../../Slices/GooglePlacesSlice";
import { resetPage } from "../../../Slices/PaginationSlice";

/**
 * Owns "search orchestration" for ActivityPage:
 * - start a new search (quickFilter / activityType / Dining)
 * - reset server-paged list state
 * - load-more for server paged results
 *
 * Pass `onNewSearchReset` to clear view refs / photo queue / etc.
 */
export default function useActivitySearchController({
  dispatch,
  lat,
  lng,
  perPage,
  manualDistance,
  manualDistanceDining,
  manualBudget,
  status,
  loadingMore,
  hasMore,
  lastQuery,
  serverPage,
  onNewSearchReset, // optional callback: resetPhotoQueue(), clear refs, etc.
} = {}) {
  const quickFilterTypes = useMemo(
    () =>
      new Set([
        "dateNight",
        "drinksAndDining",
        "outdoor",
        "movieNight",
        "gaming",
        "artAndCulture",
        "familyFun",
        "petFriendly",
        "liveMusic",
        "whatsClose",
      ]),
    []
  );

  const handleActivityFetch = useCallback(
    (type, isCustom = false, customParams = {}) => {
      if (!lat || !lng) return;

      // Let the screen clear photo queues / biz dedupe refs / timers, etc.
      if (typeof onNewSearchReset === "function") onNewSearchReset();

      // Reset server-paged list
      dispatch(clearGooglePlaces());
      dispatch(resetPage());

      const isQuickFilter = quickFilterTypes.has(type);

      // Shared params for server-paged endpoint
      const common = {
        lat,
        lng,
        radius: isCustom ? customParams.radius : manualDistance,
        budget: isCustom ? customParams.budget : manualBudget,
        page: 1,
        perPage,
      };

      if (type === "Dining") {
        // Dining path isn't server-paged in your current setup
        dispatch(
          fetchDining({
            lat,
            lng,
            activityType: type,
            radius: isCustom ? customParams.radius : manualDistanceDining,
            budget: isCustom ? customParams.budget : manualBudget,
            isCustom,
            page: 1,
            perPage,
          })
        );
        return;
      }

      dispatch(
        fetchGooglePlaces({
          ...common,
          ...(isQuickFilter ? { quickFilter: type } : { activityType: type }),
        })
      );
    },
    [
      lat,
      lng,
      perPage,
      manualDistance,
      manualDistanceDining,
      manualBudget,
      dispatch,
      onNewSearchReset,
      quickFilterTypes,
    ]
  );

  const handleLoadMore = useCallback(() => {
    if (status === "loading") return;
    if (loadingMore) return;
    if (!hasMore) return;
    if (!lastQuery?.lat || !lastQuery?.lng) return;

    const nextPage = (serverPage || 1) + 1;
    const perPageToUse = lastQuery?.perPage || perPage;

    // ✅ If the last search was Dining, paginate Dining
    if (lastQuery?.activityType === "Dining" && !lastQuery?.quickFilter) {
      dispatch(
        fetchDining({
          ...lastQuery,
          page: nextPage,
          perPage: perPageToUse,
        })
      );
      return;
    }

    // ✅ Otherwise paginate the server-paged endpoint
    dispatch(
      fetchGooglePlaces({
        ...lastQuery,
        page: nextPage,
        perPage: perPageToUse,
      })
    );
  }, [status, loadingMore, hasMore, lastQuery, serverPage, perPage, dispatch]);

  return {
    handleActivityFetch,
    handleLoadMore,
  };
}
