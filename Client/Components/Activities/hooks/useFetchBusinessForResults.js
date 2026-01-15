import { useEffect, useRef, useCallback } from "react";
import { fetchBusinessData } from "../../../Slices/PlacesSlice";

/**
 * Fetches missing business records for the current results list.
 *
 * - Dedupe by placeId across rerenders
 * - Batches requests to keep payload sane
 * - Only runs when list has items
 *
 * Expected item shape: item.place_id
 */
export default function useFetchBusinessForResults({
  dispatch,
  results,
  batchSize = 50,
} = {}) {
  const fetchedIdsRef = useRef(new Set());

  // Optional: allow callers to reset between searches
  const resetFetchedIds = useCallback(() => {
    fetchedIdsRef.current = new Set();
  }, []);

  useEffect(() => {
    if (!dispatch) return;
    if (!Array.isArray(results) || results.length === 0) return;

    // Collect unique place_ids from results
    const ids = [];
    for (const item of results) {
      const id = item?.place_id;
      if (id) ids.push(id);
    }
    if (!ids.length) return;

    const unique = Array.from(new Set(ids));

    // Find which ids we haven't fetched yet
    const missing = [];
    for (const id of unique) {
      if (!fetchedIdsRef.current.has(id)) missing.push(id);
    }
    if (!missing.length) return;

    // Mark as fetched before dispatch to prevent re-entrancy spam
    for (const id of missing) fetchedIdsRef.current.add(id);

    // Batch dispatch to avoid huge payloads
    for (let i = 0; i < missing.length; i += batchSize) {
      const chunk = missing.slice(i, i + batchSize);
      dispatch(fetchBusinessData(chunk));
    }
  }, [dispatch, results, batchSize]);

  return { resetFetchedIds };
}
