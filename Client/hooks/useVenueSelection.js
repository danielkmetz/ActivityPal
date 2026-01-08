import { useCallback, useEffect, useMemo, useState } from "react";
import { venueFromBusiness, venueFromCustom } from "../utils/posts/venueBuilder";

/**
 * Owns all venue-related state + edit hydration + reset-on-leave.
 *
 * Inputs:
 * - navigation: from useNavigation()
 * - routeKey: from useRoute().key
 * - postType: current postType ("review"|"check-in"|"invite")
 * - isEditing: boolean
 * - initialPost: post being edited (or null)
 * - initialBusinessFromRoute: business passed into new flow (recap) (or null)
 */
export default function useVenueSelection({
  navigation,
  routeKey,
  postType,
  isEditing,
  initialPost,
  initialBusinessFromRoute,
}) {
  const [business, setBusiness] = useState(null);
  const [inviteVenueMode, setInviteVenueMode] = useState("place"); // "place" | "custom"
  const [customVenue, setCustomVenue] = useState({ label: "", address: "" });

  // --------- computed venue object (invite only) ---------
  const inviteVenue = useMemo(() => {
    if (postType !== "invite") return null;
    return inviteVenueMode === "custom"
      ? venueFromCustom(customVenue)
      : venueFromBusiness(business);
  }, [postType, inviteVenueMode, customVenue, business]);

  // --------- handlers ---------
  const handlePlaceSelected = useCallback((details) => {
    if (!details) return;

    setBusiness({
      place_id: details.place_id,
      name: details.name || "",
      formatted_address: details.formatted_address || "",
      geometry: details.geometry || null,
      types: details.types || [],
    });
  }, []);

  const clearBusiness = useCallback(() => {
    setBusiness(null);
  }, []);

  const selectInvitePlaceVenue = useCallback(() => {
    setInviteVenueMode("place");
    // keep customVenue so user can toggle back without losing it
  }, []);

  const selectInviteCustomVenue = useCallback(() => {
    setInviteVenueMode("custom");
    // critical: clear business so you never submit stale placeId
    setBusiness(null);
  }, []);

  // --------- reset place state on leave / unmount ---------
  const resetPlaceState = useCallback(() => {
    setBusiness(null);
  }, []);

  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener("beforeRemove", resetPlaceState);
    return unsub;
  }, [navigation, resetPlaceState]);

  useEffect(() => {
    return () => resetPlaceState();
  }, [resetPlaceState]);

  // --------- edit hydration: venue portion ONLY ---------
  useEffect(() => {
    if (!isEditing || !initialPost) return;

    // INVITE edit hydration
    if (initialPost.type === "invite") {
      const v = initialPost.venue || null;
      const isCustom = v?.kind === "custom";

      if (isCustom) {
        setInviteVenueMode("custom");
        setCustomVenue({
          label: v?.label || initialPost.businessName || "",
          address: v?.address || initialPost.location || "",
        });
        setBusiness(null);
        return;
      }

      // place venue (or legacy invite with placeId)
      setInviteVenueMode("place");
      setCustomVenue({ label: "", address: "" });

      const placeId = v?.placeId || initialPost.placeId || null;
      const label = v?.label || initialPost.businessName || "";
      const address = v?.address || initialPost.location || "";

      setBusiness(
        placeId
          ? { place_id: placeId, name: label, formatted_address: address }
          : null
      );
      return;
    }

    // REVIEW / CHECK-IN edit hydration
    setInviteVenueMode("place");
    setCustomVenue({ label: "", address: "" });

    setBusiness({
      place_id: initialPost.placeId,
      name: initialPost.businessName,
      formatted_address: initialPost.location || "",
    });
  }, [isEditing, initialPost?._id]);

  // --------- new post hydration from recap route (venue portion ONLY) ---------
  useEffect(() => {
    if (isEditing) return;
    if (!initialBusinessFromRoute) return;
    if (business) return;
    setBusiness(initialBusinessFromRoute);
  }, [isEditing, initialBusinessFromRoute, business]);

  // --------- autocomplete contracts ---------
  const prefillLabel = useMemo(() => {
    return (
      business?.name ||
      (isEditing ? initialPost?.businessName : "") ||
      (!isEditing ? initialBusinessFromRoute?.name : "") ||
      ""
    );
  }, [business?.name, isEditing, initialPost?.businessName, initialBusinessFromRoute?.name]);

  const placesKey = useMemo(() => {
    const editId = isEditing ? initialPost?._id || "edit" : "new";
    return `places:${routeKey}:${editId}`;
  }, [routeKey, isEditing, initialPost?._id]);

  return {
    // state
    business,
    inviteVenueMode,
    customVenue,

    // setters (sometimes useful)
    setBusiness,
    setInviteVenueMode,
    setCustomVenue,

    // computed
    inviteVenue,
    prefillLabel,
    placesKey,

    // handlers
    handlePlaceSelected,
    clearBusiness,
    selectInvitePlaceVenue,
    selectInviteCustomVenue,
  };
}
