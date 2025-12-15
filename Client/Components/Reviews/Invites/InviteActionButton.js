import React, { memo, useCallback, useMemo, useState } from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import InviteModal from "../../ActivityInvites/InviteModal";
import { selection } from "../../../utils/Haptics/haptics";

function InviteActionButton({
  suggestion,              // needed for InviteModal when creating
  existingInvite = null,   // if present => edit flow
  createLabel = "Invite",
  editLabel = "Edit Invite",
  disabled = false,
  style,
  textStyle,
  modalProps = {},         // optional overrides for InviteModal
}) {
  const navigation = useNavigation();
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const label = useMemo(
    () => (existingInvite ? editLabel : createLabel),
    [existingInvite, editLabel, createLabel]
  );

  const openModal = useCallback(() => setInviteModalVisible(true), []);
  const closeModal = useCallback(() => setInviteModalVisible(false), []);

  const handlePress = useCallback(() => {
    selection();
    if (disabled) return;

    if (existingInvite) {
      navigation.navigate("CreatePost", {
        postType: "invite",
        isEditing: true,
        initialPost: existingInvite,
      });
      return;
    }

    openModal();
  }, [disabled, existingInvite, navigation, openModal]);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handlePress}
        disabled={disabled}
        style={[styles.button, disabled && styles.disabled, style]}
      >
        <Text style={[styles.text, textStyle]}>{label}</Text>
      </TouchableOpacity>
      <InviteModal
        visible={inviteModalVisible}
        onClose={closeModal}
        isEditing={false}
        suggestion={suggestion}
        {...modalProps}
      />
    </>
  );
}

export default memo(InviteActionButton);

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#1E88E5",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 15,
    elevation: 2,
    marginLeft: 8,
  },
  disabled: { opacity: 0.5 },
  text: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});
