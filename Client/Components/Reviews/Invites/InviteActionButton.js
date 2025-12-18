import React, { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import InviteModal from "../../ActivityInvites/InviteModal";
import { selection } from "../../../utils/Haptics/haptics";

function InviteActionButton({
  suggestion,
  existingInvite = null,
  createLabel = "Invite",
  editLabel = "Edit Invite",
  disabled = false,
  variant = "pill",          // "pill" | "primary" | "row"
  fullWidth = false,
  color,                    // optional override for pill/primary background
  hitSlop = 10,
  style,
  textStyle,
  modalProps = {},
  editRouteName = "CreatePost",
  getEditParams,            // (existingInvite) => params
}) {
  const navigation = useNavigation();
  const [inviteModalVisible, setInviteModalVisible] = useState(false);

  const label = useMemo(
    () => (existingInvite ? editLabel : createLabel),
    [existingInvite, editLabel, createLabel]
  );

  const openModal = useCallback(() => setInviteModalVisible(true), []);
  const closeModal = useCallback(() => setInviteModalVisible(false), []);

  const resolvedBg = useMemo(() => {
    if (variant === "row") return null; // row is typically transparent (sheet provides background)
    if (color) return { backgroundColor: color };
    return variant === "primary"
      ? { backgroundColor: "#111" }
      : { backgroundColor: "#1E88E5" };
  }, [variant, color]);

  const resolvedTextStyle = useMemo(() => {
    if (variant === "row") return styles.rowText;
    if (variant === "primary") return styles.primaryText;
    return styles.pillText;
  }, [variant]);

  const handlePress = useCallback(() => {
    if (disabled) return;

    selection();

    if (existingInvite) {
      const params =
        typeof getEditParams === "function"
          ? getEditParams(existingInvite)
          : {
            postType: "invite",
            isEditing: true,
            initialPost: existingInvite,
          };

      navigation.navigate(editRouteName, params);
      return;
    }

    openModal();
  }, [disabled, existingInvite, navigation, editRouteName, getEditParams, openModal]);

  const pressableStyle = useCallback(
    ({ pressed }) => [
      styles.base,
      variant === "row" && styles.row,
      variant === "primary" && styles.primary,
      variant === "pill" && styles.pill,

      fullWidth && styles.fullWidth,

      resolvedBg,
      disabled && styles.disabled,
      pressed && !disabled && styles.pressed,

      style,
    ],
    [variant, fullWidth, resolvedBg, disabled, style]
  );

  return (
    <>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        hitSlop={hitSlop}
        style={pressableStyle}
      >
        <Text style={[resolvedTextStyle, textStyle]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {/* Keep behavior: create => modal */}
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
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  primary: {
    height: 52,
    borderRadius: 14,
  },
  row: {
    height: 54,
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  pillText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  rowText: { color: "#111", fontWeight: "900", fontSize: 16 },
  fullWidth: { alignSelf: "stretch" },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  disabled: { opacity: 0.5 },
});
