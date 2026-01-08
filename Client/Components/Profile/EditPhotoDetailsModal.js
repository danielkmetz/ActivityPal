import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, ImageBackground, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, Image } from "react-native";
import TagFriendsModal from "../Reviews/TagFriendsModal";
import { VideoView } from "expo-video";
import { useSmartVideoPlayer } from "../../utils/useSmartVideoPlayer";
import { isVideo } from "../../utils/isVideo";
import Notch from "../Notch/Notch";
import useSlideDownDismiss from "../../utils/useSlideDown";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";

const keyOf = (p) => p?._id || p?.photoKey || p?.localKey || p?.uri || "";

export default function EditPhotoDetailsModal({
  visible,
  photo,
  onSave,
  onClose,
  onDelete,
  isPromotion,

  // optional: allow direct mutation of a single shared media array
  media,
  setMedia,
}) {
  const { width } = useWindowDimensions();
  const previewHeight = Math.round(width * 1.15);
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
  const [description, setDescription] = useState(photo?.description || "");
  const [taggedUsers, setTaggedUsers] = useState(photo?.taggedUsers || []);
  const [showTagFriendsModal, setShowTagFriendsModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [previewLayout, setPreviewLayout] = useState({ w: width, h: previewHeight });

  const getTagId = (t) => String(t?.userId || t?._id || t?.id || "");
  const getTagName = (t) => t?.username || t?.fullName || "Unknown";
  const getTagPic = (t) => t?.profilePic || t?.profilePicUrl || t?.presignedProfileUrl || null;

  useEffect(() => {
    if (visible) animateIn?.();
  }, [visible, animateIn]);

  useEffect(() => {
    setDescription(photo?.description || "");
    setTaggedUsers(photo?.taggedUsers ? JSON.parse(JSON.stringify(photo.taggedUsers)) : []);
  }, [photo]);

  const player = useSmartVideoPlayer(photo);

  const requestClose = useCallback(() => {
    animateOut?.();
  }, [animateOut]);

  const commitUpdatedPhoto = useCallback(
    (updated) => {
      // If consumer gave us setMedia + media array, update in-place
      if (typeof setMedia === "function" && Array.isArray(media)) {
        const updatedKey = keyOf(updated);
        setMedia(
          media.map((m) => (keyOf(m) === updatedKey ? { ...m, ...updated } : m))
        );
        return;
      }

      // Otherwise fall back to callback style
      if (typeof onSave === "function") {
        onSave(updated);
      }
    },
    [setMedia, media, onSave]
  );

  const removeFromMediaIfPossible = useCallback(() => {
    if (typeof setMedia === "function" && Array.isArray(media)) {
      const targetKey = keyOf(photo);
      setMedia(media.filter((m) => keyOf(m) !== targetKey));
      return true;
    }
    return false;
  }, [setMedia, media, photo]);

  const handleRemoveTagById = (id) => {
    setTaggedUsers((prev) => prev.filter((t) => getTagId(t) !== String(id)));
  };

  const handleSave = () => {
    const clonedPhoto = {
      ...photo,
      description,
      taggedUsers: taggedUsers.map((t) => ({ ...t })),
    };

    commitUpdatedPhoto(JSON.parse(JSON.stringify(clonedPhoto)));
    requestClose();
  };

  const handleDelete = () => {
    if (!photo) return;

    // If we can update media array directly, do it here
    const didRemove = removeFromMediaIfPossible();

    // Otherwise call the supplied onDelete handler
    if (!didRemove && typeof onDelete === "function") {
      onDelete(photo);
    }

    requestClose();
  };

  const handlePressPreview = (e) => {
    if (isPromotion) return;

    const { locationX, locationY } = e.nativeEvent;
    const w = previewLayout.w || width;
    const h = previewLayout.h || previewHeight;

    const xPct = w ? locationX / w : 0;
    const yPct = h ? locationY / h : 0;

    setSelectedPosition({ xPct, yPct });
    setShowTagFriendsModal(true);
  };

  const handleTagFriend = (selectedFriends) => {
    if (!selectedFriends?.length || !selectedPosition) {
      setShowTagFriendsModal(false);
      setSelectedPosition(null);
      return;
    }

    setTaggedUsers((prev) => {
      const next = prev.map((t) => ({ ...t }));

      selectedFriends.forEach((friend) => {
        const friendId = friend.userId || friend._id || friend.id;
        if (!friendId) return;

        const idx = next.findIndex((t) => String(t.userId) === String(friendId));
        const tagPatch = {
          userId: friendId,
          username:
            friend.username ||
            `${friend.firstName || ""} ${friend.lastName || ""}`.trim(),
          profilePic: friend.profilePic || friend.presignedProfileUrl || null,
          xPct: selectedPosition.xPct,
          yPct: selectedPosition.yPct,
        };

        if (idx !== -1) next[idx] = { ...next[idx], ...tagPatch };
        else next.push(tagPatch);
      });

      return next;
    });

    setShowTagFriendsModal(false);
    setSelectedPosition(null);
  };

  const renderTags = () => {
    const w = previewLayout.w || width;
    const h = previewLayout.h || previewHeight;

    return taggedUsers.map((user, index) => {
      const key = getTagId(user) || String(index);

      const left = Number.isFinite(user?.xPct) ? user.xPct * w : user?.x ?? 0;
      const top = Number.isFinite(user?.yPct) ? user.yPct * h : user?.y ?? 0;

      return (
        <View key={key} style={[styles.tagMarker, { left, top }]}>
          <TouchableOpacity
            onPress={() => handleRemoveTagById(getTagId(user))}
            style={styles.tagRemoveBtn}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Text style={styles.tagRemoveX}>×</Text>
          </TouchableOpacity>

          {getTagPic(user) ? (
            <Image source={{ uri: getTagPic(user) }} style={styles.tagProfilePic} />
          ) : (
            <View style={[styles.tagProfilePic, styles.tagProfilePicFallback]} />
          )}

          <Text style={styles.tagText} numberOfLines={1}>
            {getTagName(user)}
          </Text>
        </View>
      );
    });
  };

  return (
    <Modal visible={visible} transparent onRequestClose={requestClose}>
      <View style={styles.overlay}>
        {/* ✅ backdrop-only press closes */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={requestClose} />
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.sheet, animatedStyle]}>
              <Notch />
              <View style={styles.header}>
                <TouchableOpacity onPress={requestClose} hitSlop={10}>
                  <Text style={styles.headerBtn}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Photo</Text>
                <TouchableOpacity onPress={handleSave} hitSlop={10}>
                  <Text style={[styles.headerBtn, styles.headerBtnPrimary]}>Save</Text>
                </TouchableOpacity>
              </View>
              <View
                style={{ width, height: previewHeight, backgroundColor: "#000" }}
                onLayout={(e) => {
                  const { width: w, height: h } = e.nativeEvent.layout;
                  setPreviewLayout({ w, h });
                }}
              >
                {isVideo(photo) ? (
                  <VideoView
                    player={player}
                    style={{ width: "100%", height: "100%" }}
                    nativeControls={false}
                    allowsFullscreen={false}
                    allowsPictureInPicture={false}
                    contentFit="cover"
                  />
                ) : (
                  <Pressable onPress={handlePressPreview} style={{ width: "100%", height: "100%" }}>
                    <ImageBackground
                      source={{ uri: photo?.uri || photo?.url }}
                      style={{ width: "100%", height: "100%" }}
                    >
                      {renderTags()}
                      {!isPromotion && taggedUsers.length === 0 && (
                        <View style={styles.hintPill}>
                          <Text style={styles.hintText}>Tap anywhere to tag friends</Text>
                        </View>
                      )}
                    </ImageBackground>
                  </Pressable>
                )}
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.deleteRow} onPress={handleDelete}>
                  <Text style={styles.deleteText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
        <TagFriendsModal
          visible={showTagFriendsModal}
          onClose={() => setShowTagFriendsModal(false)}
          onSave={handleTagFriend}
          isPhotoTagging
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, justifyContent: "flex-end" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 15,
    paddingBottom: 30,
  },
  header: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e6e6e6",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerBtn: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
  },
  headerBtnPrimary: { color: "teal" },
  actions: {
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e6e6e6",
  },
  deleteRow: {
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f6f6f6",
  },
  deleteText: {
    color: "#d11a2a",
    fontWeight: "700",
  },
  tagMarker: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 220,
  },
  tagRemoveBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ff3b30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  tagRemoveX: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 12,
    fontWeight: "bold",
  },
  tagProfilePic: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  tagProfilePicFallback: {
    backgroundColor: "#666",
  },
  tagText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  hintPill: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  hintText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
});
