import React, { useEffect, useState, useCallback } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput, Dimensions, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Switch, Keyboard, Alert } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSelector } from "react-redux";
import TagFriendsModal from "../Reviews/TagFriendsModal";
import { selectFriends } from "../../Slices/friendsSlice";
import { selectUser } from "../../Slices/UserSlice";
import useSlideDownDismiss from "../../utils/useSlideDown";
import Notch from "../Notch/Notch";
import { medium } from "../../utils/Haptics/haptics";
import useInviteActions from "../../utils/UserInviteActions/userInviteActions";
import LockedPlaceHeader from "./InviteModal/LockedPlaceHeader";
import PlacesAutocomplete from "../Location/PlacesAutocomplete";
import FriendPills from "../Reviews/FriendPills";
import { venueFromBusiness } from "../../utils/posts/venueBuilder";
import { extractFormattedAddress } from "../../utils/posts/extractFormattedAddress";
import useSubmitInvite from "../../hooks/useSubmitInvite";
import useInviteModalDraft from "../../hooks/useInviteModalDraft";
import { validateAgainstSuggestionDateTime } from "../../utils/Invites/suggestionSchedule";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MAX_SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.9);

export default function InviteModal({
  visible,
  onClose,
  isEditing,
  initialInvite,
  setIsEditing,
  setInviteToEdit,
  suggestion,
}) {
  const user = useSelector(selectUser);
  const friends = useSelector(selectFriends);
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
  const { sendInviteWithConflicts, editInviteWithConflicts } = useInviteActions(initialInvite);
  const { submit, submitting } = useSubmitInvite();
  const [showFriendsModal, setShowFriendsModal] = useState(false);

  const {
    suggestionContent,
    fromSharedPost, // currently unused in UI, but kept for parity/debug
    selectedVenue,
    setSelectedVenue,
    lockPlace,
    lockedPlaceSubtitle,
    venue,
    message,
    setMessage,
    dateTime,
    setDateTime,
    isPublic,
    setIsPublic,
    effectiveIsPublic,
    selectedFriends,
    setSelectedFriends,
    recipientIds,
    removeFriendById,
  } = useInviteModalDraft({
    visible,
    isEditing,
    initialInvite,
    suggestion,
    friends,
  });

  // modal animation
  const [shouldRender, setShouldRender] = useState(visible);
  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      animateIn();
      return;
    }

    if (shouldRender) {
      (async () => {
        await animateOut();
        setShouldRender(false);
      })();
    }
  }, [visible]); // intentionally minimal deps

  const handleConfirmInvite = useCallback(async () => {
    if (submitting) return;

    if (!venue || !venue.label || !dateTime || recipientIds.length === 0) {
      Alert.alert("Error", "Please complete all invite details.");
      return;
    }

    if (venue.kind === "place" && !venue.placeId) {
      Alert.alert("Error", "Please choose a place.");
      return;
    }

    const dt = dateTime instanceof Date ? dateTime : new Date(dateTime);
    const ts = dt.getTime();
    if (!Number.isFinite(ts)) {
      Alert.alert("Error", "Invalid date/time. Please pick a different time.");
      return;
    }

    // Validate against suggestion schedule (create mode only)
    if (!isEditing && suggestionContent) {
      const schedule = validateAgainstSuggestionDateTime(dt, suggestionContent);
      if (schedule) {
        Alert.alert("Invalid date or time", `This event or promo is held ${schedule}.`);
        return;
      }
    }

    try {
      const res = await submit({
        mode: isEditing ? "edit" : "create",
        inviteId: initialInvite?._id,
        actions: { sendInviteWithConflicts, editInviteWithConflicts },

        userId: user?.id || user?._id,
        venue,
        dateTime: dt,
        message,
        isPublic: effectiveIsPublic,
        media: [], // modal doesn’t handle media here (keep empty)
        recipientIds,
      });

      if (res?.cancelled) return;

      medium();

      if (isEditing) {
        setInviteToEdit?.(null);
        setIsEditing?.(false);
        Alert.alert("Success", "Invite updated!");
      } else {
        Alert.alert("Success", "Invite sent!");
      }

      onClose?.();
    } catch (err) {
      Alert.alert("Error", err?.message || "Something went wrong. Please try again.");
    }
  }, [
    submitting,
    venue,
    dateTime,
    recipientIds,
    isEditing,
    suggestionContent,
    submit,
    initialInvite?._id,
    sendInviteWithConflicts,
    editInviteWithConflicts,
    user?.id,
    user?._id,
    message,
    effectiveIsPublic,
    onClose,
    setInviteToEdit,
    setIsEditing,
  ]);

  if (!shouldRender) return null;

  return (
    <Modal visible={shouldRender} transparent onRequestClose={animateOut}>
      <TouchableWithoutFeedback onPress={animateOut}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "position" : "height"}
            keyboardVerticalOffset={-80}
            style={styles.keyboardAvoiding}
          >
            <GestureDetector gesture={gesture}>
              <Animated.View style={[styles.modalContainer, animatedStyle]}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                  <View>
                    <Notch />
                    <Text style={styles.title}>
                      {isEditing ? "Edit Vybe Invite" : "Create Vybe Invite"}
                    </Text>
                    {/* Venue */}
                    {lockPlace ? (
                      <>
                        <Text style={styles.label}>Place</Text>
                        <LockedPlaceHeader
                          label={fromSharedPost ? "From shared promo/event" : "Suggested"}
                          title={venue?.label || suggestionContent?.businessName}
                          subtitle={lockedPlaceSubtitle}
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.label}>Search for a Place</Text>
                        <PlacesAutocomplete
                          lat={null}
                          lng={null}
                          prefillLabel={venue?.label || ""}
                          onClear={() => setSelectedVenue(null)}
                          onPlaceSelected={(details) => {
                            let v = venueFromBusiness(details);

                            if (v && !v.address) {
                              v = {
                                ...v,
                                address:
                                  extractFormattedAddress(details) ||
                                  v?.geo?.formattedAddress ||
                                  null,
                              };
                            }

                            if (!v?.kind || !v?.label) return;
                            if (v.kind === "place" && !v.placeId) return;

                            setSelectedVenue(v);
                          }}
                        />
                      </>
                    )}
                    {/* Visibility */}
                    <View style={styles.switchContainer}>
                      <Text style={styles.label}>
                        {effectiveIsPublic ? "Public Invite 🌍" : "Private Invite 🔒"}
                      </Text>
                      <Switch
                        value={effectiveIsPublic}
                        onValueChange={(v) => setIsPublic(v)}
                        trackColor={{ false: "#ccc", true: "#4cd137" }}
                        thumbColor={Platform.OS === "android" ? "#fff" : undefined}
                      />
                    </View>
                    {/* Date */}
                    <View style={styles.dateTimeInput}>
                      <Text style={styles.label}>Select Date & Time</Text>
                      <DateTimePicker
                        value={dateTime || new Date()}
                        mode="datetime"
                        display="default"
                        onChange={(event, selectedDate) => {
                          if (selectedDate) setDateTime(selectedDate);
                        }}
                      />
                    </View>
                    {/* Message */}
                    <View style={styles.noteContainer}>
                      <Text style={styles.label}>Add a Note (optional)</Text>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Let your friends know what's up..."
                        multiline
                        numberOfLines={3}
                        value={message}
                        onChangeText={setMessage}
                      />
                    </View>
                    {/* Recipients */}
                    <TouchableOpacity
                      style={styles.friendButton}
                      onPress={() => setShowFriendsModal(true)}
                    >
                      <Text style={styles.friendButtonText}>
                        {selectedFriends.length > 0
                          ? `👥 ${selectedFriends.length} Selected`
                          : "➕ Select Friends"}
                      </Text>
                    </TouchableOpacity>
                    <FriendPills
                      friends={selectedFriends}
                      onRemove={(u) => removeFriendById(u)}
                    />
                    <TouchableOpacity
                      style={[styles.confirmButton, submitting && { opacity: 0.65 }]}
                      onPress={handleConfirmInvite}
                      disabled={submitting}
                    >
                      <Text style={styles.confirmText}>
                        {submitting ? "Submitting..." : isEditing ? "Save Edit" : "Send Invite"}
                      </Text>
                    </TouchableOpacity>
                    <TagFriendsModal
                      visible={showFriendsModal}
                      onClose={() => setShowFriendsModal(false)}
                      onSave={(selected) => {
                        setSelectedFriends(Array.isArray(selected) ? selected : []);
                        setShowFriendsModal(false);
                      }}
                      isEventInvite
                      initialSelectedFriends={selectedFriends}
                    />
                  </View>
                </TouchableWithoutFeedback>
              </Animated.View>
            </GestureDetector>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "flex-end",
  },
  keyboardAvoiding: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  modalContainer: {
    width: "100%",
    maxHeight: MAX_SHEET_HEIGHT,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "500", marginBottom: 4, color: "#555" },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  dateTimeInput: {
    marginBottom: 25,
  },
  noteContainer: { marginBottom: 16 },
  noteInput: {
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: "#f9f9f9",
    textAlignVertical: "top",
  },
  friendButton: {
    backgroundColor: "#33cccc",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  friendButtonText: { color: "#fff", fontSize: 15, fontWeight: "500" },
  confirmButton: {
    backgroundColor: "#009999",
    padding: 14,
    borderRadius: 8,
    marginTop: 14,
    alignItems: "center",
  },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
