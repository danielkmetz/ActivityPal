import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, Platform } from "react-native";
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

function normalizePlace(selectedBusiness, initialInvite) {
  // Parent (CreatePost) business shape: { place_id, name, formatted_address, ... }
  const fromParent = selectedBusiness
    ? {
        placeId: selectedBusiness.place_id || selectedBusiness.placeId || null,
        businessName: selectedBusiness.name || selectedBusiness.businessName || null,
      }
    : null;

  if (fromParent?.placeId && fromParent?.businessName) return fromParent;

  // Fallback for edit mode if parent hasn't populated business yet
  const placeId = initialInvite?.placeId || initialInvite?.business?.placeId || null;
  const businessName = initialInvite?.businessName || initialInvite?.business?.businessName || null;

  return placeId && businessName ? { placeId, businessName } : { placeId: null, businessName: null };
}

function recipientsToFriendObjects({ recipients, friends }) {
  const list = Array.isArray(recipients) ? recipients : [];
  const friendList = Array.isArray(friends) ? friends : [];

  return list
    .map((r) => {
      const src = r?.user || r;
      const id = toId(src);
      if (!id) return null;

      const fromFriends = friendList.find((f) => toId(f) === id);
      if (fromFriends) return fromFriends;

      return {
        _id: id,
        id,
        userId: id,
        firstName: src?.firstName,
        lastName: src?.lastName,
        username: src?.username || src?.fullName || src?.firstName || "Unknown",
        profilePicUrl: src?.profilePicUrl || src?.presignedProfileUrl || null,
      };
    })
    .filter(Boolean);
}

export default function InviteForm({
  isEditing = false,
  initialInvite = null,
  selectedBusiness = null, 
}) {
  const navigation = useNavigation();
  const friends = useSelector(selectFriends);
  const { sendInviteWithConflicts, editInviteWithConflicts } = useInviteActions(initialInvite);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [dateTime, setDateTime] = useState(null);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [isPublic, setIsPublic] = useState(true);
  const [note, setNote] = useState("");
  const place = useMemo(() => normalizePlace(selectedBusiness, initialInvite), [selectedBusiness, initialInvite]);
  const placeId = place.placeId;
  const businessName = place.businessName;

  useEffect(() => {
    if (!isEditing || !initialInvite) return;

    setNote(initialInvite.note || "");

    const rawDate =
      initialInvite.details?.dateTime ||
      initialInvite.dateTime ||
      initialInvite.sortDate ||
      initialInvite.createdAt;

    setDateTime(rawDate ? new Date(rawDate) : new Date());

    // if you store isPublic on invite, hydrate it (supports either location)
    const existingPublic =
      initialInvite.details?.isPublic ??
      initialInvite.isPublic ??
      true;

    setIsPublic(!!existingPublic);

    const recipients = initialInvite.details?.recipients || [];
    setSelectedFriends(recipientsToFriendObjects({ recipients, friends }));
  }, [isEditing, initialInvite, friends]);

  const recipientIds = useMemo(() => {
    return Array.from(new Set((selectedFriends || []).map((f) => toId(f)).filter(Boolean)));
  }, [selectedFriends]);

  const handleConfirmInvite = useCallback(async () => {
    if (!placeId || !businessName || !dateTime || recipientIds.length === 0) {
      alert("Please complete all invite details.");
      return;
    }

    const base = { placeId, businessName, dateTime, note, isPublic };

    try {
      if (isEditing && initialInvite) {
        const { cancelled } = await editInviteWithConflicts({
          inviteIdOverride: initialInvite._id,
          updates: base,
          recipientIds,
        });
        if (cancelled) return;

        medium();
        alert("Invite updated!");
      } else {
        const { cancelled } = await sendInviteWithConflicts({
          ...base,
          recipientIds,
        });
        if (cancelled) return;

        medium();
        alert("Invite sent!");
      }

      navigation.goBack();
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again.");
    }
  }, [
    placeId,
    businessName,
    dateTime,
    recipientIds,
    note,
    isPublic,
    isEditing,
    initialInvite,
    editInviteWithConflicts,
    sendInviteWithConflicts,
    navigation,
  ]);

  return (
    <View style={styles.container}>
      <SectionHeader title="Visibility" />
      <View style={styles.switchContainer}>
        <View style={styles.switchLabelContainer}>
          <FontAwesome name={isPublic ? "globe" : "lock"} size={20} color="black" style={styles.icon} />
          <Text style={styles.label}>{isPublic ? "Public" : "Private"}</Text>
        </View>
        <Switch
          value={isPublic}
          onValueChange={setIsPublic}
          trackColor={{ false: "#ccc", true: "#009999" }}
          thumbColor={Platform.OS === "android" ? "#fff" : undefined}
        />
      </View>
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
          value={note}
          onChangeText={setNote}
        />
      </View>
      <TouchableOpacity style={styles.friendButton} onPress={() => setShowFriendsModal(true)}>
        <Text style={styles.friendButtonText}>
          {selectedFriends.length > 0 ? `👥 ${selectedFriends.length} Selected` : "➕ Select Friends"}
        </Text>
      </TouchableOpacity>
      <FriendPills
        friends={selectedFriends}
        onRemove={(userToRemove) => {
          const id = toId(userToRemove);
          setSelectedFriends((prev) => prev.filter((u) => toId(u) !== id));
        }}
      />
      <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmInvite}>
        <Text style={styles.confirmText}>{isEditing ? "Save Edit" : "Send Invite"}</Text>
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
  locationText: {
    marginTop: 6,
    marginBottom: 8,
    opacity: 0.7,
    fontSize: 14,
  },
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
});
