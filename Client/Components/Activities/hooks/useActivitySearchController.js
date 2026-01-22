import { useCallback, useMemo } from "react";
import { fetchGooglePlaces, fetchDining, clearGooglePlaces } from "../../../Slices/GooglePlacesSlice";
import { resetPage } from "../../../Slices/PaginationSlice";

/**
 * Owns "search orchestration" for ActivityPage:
 * - start a new search (quickFilter / activityType / Dining)
 * - reset server-paged list state
 * - load-more for server paged results
 *
 * Cursor pagination:
 * - Dining now uses cursor-based paging from meta.cursor/meta.hasMore
 * - places2 can stay offset/page-based (serverPage + 1)
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
  cursor, // NEW: Dining cursor from meta.cursor
  lastQuery,
  serverPage, // still used for places2 offset pagination
  onNewSearchReset,
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

      if (typeof onNewSearchReset === "function") onNewSearchReset();

      // Reset list state
      dispatch(clearGooglePlaces());
      dispatch(resetPage());

      const isQuickFilter = quickFilterTypes.has(type);

      const common = {
        lat,
        lng,
        radius: isCustom ? customParams.radius : manualDistance,
        budget: isCustom ? customParams.budget : manualBudget,
        page: 1, // only relevant for places2 endpoint
        perPage,
      };

      if (type === "Dining") {
        // Dining is now cursor-paged: starting a new session => cursor: null
        dispatch(
          fetchDining({
            lat,
            lng,
            activityType: type,
            radius: isCustom ? customParams.radius : manualDistanceDining,
            budget: isCustom ? customParams.budget : manualBudget,
            isCustom,
            perPage,
            cursor: null,
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

    // Need a prior query to know which endpoint to continue
    if (!lastQuery) return;

    const perPageToUse = lastQuery?.perPage || perPage;

    // ---- Dining: cursor-based pagination ----
    if (lastQuery?.activityType === "Dining" && !lastQuery?.quickFilter) {
      // If cursor is missing, there is nothing to continue
      if (!cursor) return;

      // Send cursor + (optionally) lastQuery fields; backend ignores them when cursor is present
      dispatch(
        fetchDining({
          ...lastQuery,
          cursor,
          perPage: perPageToUse,
        })
      );
      return;
    }

    // ---- places2: offset/page-based pagination ----
    if (!lastQuery?.lat || !lastQuery?.lng) return;

    const nextPage = (serverPage || 1) + 1;

    dispatch(
      fetchGooglePlaces({
        ...lastQuery,
        page: nextPage,
        perPage: perPageToUse,
      })
    );
  }, [status, loadingMore, hasMore, lastQuery, cursor, serverPage, perPage, dispatch]);

  return {
    handleActivityFetch,
    handleLoadMore,
  };
}
