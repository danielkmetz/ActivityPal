import React from "react";
import { View } from "react-native";
import PlacesAutocomplete from "../../Location/PlacesAutocomplete";
import CustomVenueFields from "./CustomVenueFields";
import InviteVenueToggle from "./InviteVenueToggle";

export default function VenuePicker({
  postType,
  show,

  // invite-only
  inviteVenueMode,
  onSelectInvitePlace,
  onSelectInviteCustom,
  customVenue,
  setCustomVenue,

  // autocomplete
  placesKey,
  prefillLabel,
  onPlaceSelected,
  onClearPlace,
}) {
  if (!show) return null;

  // Keep your stacking behavior intact for the dropdown.
  return (
    <View style={{ zIndex: 999, position: "relative" }}>
      {postType === "invite" ? (
        <>
          <InviteVenueToggle
            mode={inviteVenueMode}
            onSelectPlace={onSelectInvitePlace}
            onSelectCustom={onSelectInviteCustom}
          />
          {inviteVenueMode === "place" ? (
            <PlacesAutocomplete
              key={placesKey}
              onPlaceSelected={onPlaceSelected}
              prefillLabel={prefillLabel}
              onClear={onClearPlace}
            />
          ) : (
            <CustomVenueFields
              customVenue={customVenue}
              setCustomVenue={setCustomVenue}
              placesKey={`${placesKey}:addr`}
            />
          )}
        </>
      ) : (
        <PlacesAutocomplete
          key={placesKey}
          onPlaceSelected={onPlaceSelected}
          prefillLabel={prefillLabel}
          onClear={onClearPlace}
        />
      )}
    </View>
  );
}
