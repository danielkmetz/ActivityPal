import React, { useMemo, useCallback, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, Platform, Alert } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSelector } from "react-redux";
import { selectFriends } from "../../Slices/friendsSlice";
import { FontAwesome } from "@expo/vector-icons";
import TagFriendsModal from "../Reviews/TagFriendsModal";
import { useNavigation } from "@react-navigation/native";
import SectionHeader from "../Reviews/SectionHeader";
import FriendPills from "../Reviews/FriendPills";
import { medium } from "../../utils/Haptics/haptics";
import useInviteActions from "../../utils/UserInviteActions/userInviteActions";
import { toId } from "../../utils/Formatting/toId";
import { selectUser } from "../../Slices/UserSlice";
import useSubmitInvite from "../../hooks/useSubmitInvite";
import useInviteDraft from "../../hooks/useInviteDraft";

export default function InviteForm({
  isEditing = false,
  initialInvite = null,
  selectedVenue = null,
  selectedMedia = [],
}) {
  const navigation = useNavigation();
  const friends = useSelector(selectFriends);
  const user = useSelector(selectUser);
  const { sendInviteWithConflicts, editInviteWithConflicts } = useInviteActions(initialInvite);
  const { submit, submitting } = useSubmitInvite();
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const meId = useMemo(() => toId(user?.id || user?._id), [user?.id, user?._id]);

  const {
    venue,
    privacyLocked,
    effectiveIsPublic,
    isPublic,
    setIsPublic,
    message,
    setMessage,
    dateTime,
    setDateTime,
    selectedFriends,
    setSelectedFriends,
    recipientIds,
    removeFriendById,
  } = useInviteDraft({
    isEditing,
    initialInvite,
    selectedVenue,
    friends,
  });

  const handleConfirmInvite = useCallback(async () => {
    if (submitting) return;

    if (!meId) {
      Alert.alert("Error", "User not loaded. Please try again.");
      return;
    }

    if (!venue || !venue.label || !dateTime || recipientIds.length === 0) {
      Alert.alert("Error", "Please complete all invite details.");
      return;
    }
    if (venue.kind === "place" && !venue.placeId) {
      Alert.alert("Error", "Please choose a place.");
      return;
    }

    try {
      const res = await submit({
        mode: isEditing ? "edit" : "create",
        inviteId: initialInvite?._id,
        actions: { sendInviteWithConflicts, editInviteWithConflicts },
        userId: meId,
        venue,
        dateTime,
        message,
        isPublic: effectiveIsPublic,
        media: selectedMedia,
        recipientIds,
      });

      if (res?.cancelled) return;

      medium();
      Alert.alert("Success", isEditing ? "Invite updated!" : "Invite sent!");
      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", err?.message || "Something went wrong. Please try again.");
    }
  }, [
    submitting,
    meId,
    venue,
    dateTime,
    recipientIds,
    message,
    effectiveIsPublic,
    selectedMedia,
    submit,
    isEditing,
    initialInvite?._id,
    sendInviteWithConflicts,
    editInviteWithConflicts,
    navigation,
  ]);

  return (
    <View style={styles.container}>
      <SectionHeader title="Visibility" />
      <View style={styles.switchContainer}>
        <View style={styles.switchLabelContainer}>
          <FontAwesome
            name={effectiveIsPublic ? "globe" : "lock"}
            size={20}
            color="black"
            style={styles.icon}
          />
          <Text style={styles.label}>
            {privacyLocked ? "Private (Custom)" : effectiveIsPublic ? "Public" : "Private"}
          </Text>
        </View>
        <Switch
          value={effectiveIsPublic}
          onValueChange={(v) => {
            if (privacyLocked) return;
            setIsPublic(v);
          }}
          disabled={privacyLocked}
          trackColor={{ false: "#ccc", true: "#009999" }}
          thumbColor={Platform.OS === "android" ? "#fff" : undefined}
        />
      </View>
      {privacyLocked && (
        <Text style={styles.privacyHint}>
          Custom locations are private and won’t appear in discovery.
        </Text>
      )}
      <View style={{ marginTop: 10 }}>
        <SectionHeader title="Date & Time" />
        <View style={{ marginTop: 5, marginLeft: -10 }}>
          <DateTimePicker
            value={dateTime || new Date()}
            mode="datetime"
            display="default"
            onChange={(event, selectedDate) => selectedDate && setDateTime(selectedDate)}
          />
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        <SectionHeader title="Note (Optional)" />
        <TextInput
          style={styles.noteInput}
          placeholder="Let your friends know what's up..."
          multiline
          value={message}
          onChangeText={setMessage}
        />
      </View>
      <TouchableOpacity style={styles.friendButton} onPress={() => setShowFriendsModal(true)}>
        <Text style={styles.friendButtonText}>
          {selectedFriends.length > 0 ? `👥 ${selectedFriends.length} Selected` : "➕ Select Friends"}
        </Text>
      </TouchableOpacity>
      <FriendPills friends={selectedFriends} onRemove={(u) => removeFriendById(u)} />
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
          setSelectedFriends(selected);
          setShowFriendsModal(false);
        }}
        isEventInvite
        initialSelectedFriends={selectedFriends}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 100, backgroundColor: "#fff" },
  label: { fontSize: 14, fontWeight: "500", marginVertical: 10 },
  noteInput: {
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: "#f9f9f9",
    textAlignVertical: "top",
    marginBottom: 16,
    marginTop: 5,
    height: 80,
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
    alignItems: "center",
    marginTop: 20,
  },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switchContainer: { flexDirection: "row", alignItems: "center" },
  switchLabelContainer: { flexDirection: "row", alignItems: "center", marginRight: 10 },
  icon: { marginRight: 8 },
  privacyHint: {
    marginTop: -6,
    marginBottom: 6,
    opacity: 0.7,
    fontSize: 12,
  },
});
