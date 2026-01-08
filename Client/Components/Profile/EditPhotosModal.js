import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, Image, Modal, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, Dimensions } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from "react-native-reanimated";
import EditPhotoDetailsModal from "./EditPhotoDetailsModal";
import VideoThumbnail from "../Reviews/VideoThumbnail";

const { width: screenWidth } = Dimensions.get("window");
const columnMargin = 5;
const numColumns = 3;
const columnWidth = (screenWidth - columnMargin * (numColumns + 1)) / numColumns;

const keyOf = (p) => p?._id || p?.photoKey || p?.localKey || p?.uri || "";

function DraggableMedia({ item, index, positions, onSwap, onPress }) {
  if (!positions[index]) return null;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (positions[index]) {
      translateX.value = withSpring(positions[index].x);
      translateY.value = withSpring(positions[index].y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, index]);

  const gesture = useMemo(() => {
    return Gesture.Pan()
      .onUpdate((e) => {
        const base = positions[index];
        if (!base) return;
        translateX.value = e.translationX + base.x;
        translateY.value = e.translationY + base.y;
      })
      .onEnd(() => {
        const base = positions[index];
        if (!base) return;

        const newIndex = positions.findIndex((pos) => {
          if (!pos) return false;
          return (
            Math.abs(pos.x - translateX.value) < columnWidth / 2 &&
            Math.abs(pos.y - translateY.value) < columnWidth / 2
          );
        });

        if (newIndex !== -1 && newIndex !== index) {
          runOnJS(onSwap)(index, newIndex);
        } else {
          translateX.value = withSpring(base.x);
          translateY.value = withSpring(base.y);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, index, onSwap]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const cleanUrl = (item?.uri || item?.url || item?.photoKey || "").split("?")[0];
  const isVideo =
    cleanUrl.toLowerCase().endsWith(".mp4") || cleanUrl.toLowerCase().endsWith(".mov");

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.draggableItem, animatedStyle]}>
        <TouchableWithoutFeedback onPress={() => onPress(item)}>
          {isVideo ? (
            <View>
              <VideoThumbnail file={item} width={columnWidth} height={columnWidth} />
            </View>
          ) : (
            <Image
              source={{ uri: item?.uri || item?.url }}
              style={styles.mediaThumbnail}
              resizeMode="cover"
            />
          )}
        </TouchableWithoutFeedback>
      </Animated.View>
    </GestureDetector>
  );
}

export default function EditPhotosModal({
  visible,
  media,
  setMedia,     // preferred
  onSave,       // legacy fallback
  onClose,
  isPromotion,
  onDelete,     // optional external side-effect
}) {
  const baseMedia = useMemo(() => (Array.isArray(media) ? media : []), [media]);
  const [draftMedia, setDraftMedia] = useState(baseMedia);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [shouldRenderGrid, setShouldRenderGrid] = useState(false);
  const [positions, setPositions] = useState([]);

  const commitToParent = useCallback(
    (next) => {
      const normalized = Array.isArray(next) ? next : [];
      // stamp order so downstream is deterministic
      const stamped = normalized.map((m, idx) => ({
        ...m,
        order: m?.order != null ? m.order : idx,
      }));

      // Prefer setMedia if provided; otherwise use onSave.
      if (typeof setMedia === "function") setMedia(stamped);
      else if (typeof onSave === "function") onSave(stamped);
    },
    [setMedia, onSave]
  );

  // when opening, take a fresh snapshot into draft
  useEffect(() => {
    if (!visible) {
      setShouldRenderGrid(false);
      setSelectedItem(null);
      setDetailsModalVisible(false);
      return;
    }

    setDraftMedia(baseMedia);

    const t = setTimeout(() => setShouldRenderGrid(true), 100);
    return () => clearTimeout(t);
  }, [visible, baseMedia]);

  // compute grid positions from draft length
  useEffect(() => {
    const list = Array.isArray(draftMedia) ? draftMedia : [];
    const updatedPositions = list.map((_, index) => {
      const row = Math.floor(index / numColumns);
      const col = index % numColumns;
      return {
        x: col * (columnWidth + columnMargin) + columnMargin,
        y: row * (columnWidth + columnMargin) + columnMargin,
      };
    });
    setPositions(updatedPositions);
  }, [draftMedia]);

  const handleItemClick = (item) => {
    setSelectedItem(item);
    setDetailsModalVisible(true);
  };

  const handleItemSave = (updatedItem) => {
    setDraftMedia((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const updatedKey = keyOf(updatedItem);

      return list.map((m) => {
        const same =
          (m?._id && updatedItem?._id && String(m._id) === String(updatedItem._id)) ||
          (m?.photoKey && updatedItem?.photoKey && String(m.photoKey) === String(updatedItem.photoKey)) ||
          (m?.uri && updatedItem?.uri && String(m.uri) === String(updatedItem.uri)) ||
          (updatedKey && keyOf(m) === updatedKey);

        return same ? { ...m, ...updatedItem } : m;
      });
    });
  };

  const handleRemoveItem = (item) => {
    const removeKey = keyOf(item);

    setDraftMedia((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((m) => keyOf(m) !== removeKey);
    });

    if (typeof onDelete === "function") {
      onDelete(item);
    }

    setDetailsModalVisible(false);
    setSelectedItem(null);
  };

  const swapItems = (fromIndex, toIndex) => {
    setDraftMedia((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      if (!list[fromIndex] || !list[toIndex]) return list;

      const moved = list.splice(fromIndex, 1)[0];
      list.splice(toIndex, 0, moved);

      // update order to match new array order
      return list.map((m, idx) => ({ ...m, order: idx }));
    });
  };

  const handleSaveAll = () => {
    commitToParent(draftMedia);
    onClose?.();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <Text style={styles.title}>Edit Photos</Text>
        {shouldRenderGrid && (
          <View style={styles.gridContainer}>
            {(Array.isArray(draftMedia) ? draftMedia : []).map((item, index) => (
              <DraggableMedia
                key={keyOf(item) || String(index)}
                item={item}
                index={index}
                positions={positions}
                onSwap={swapItems}
                onPress={handleItemClick}
              />
            ))}
          </View>
        )}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveAll}>
            <Text style={styles.saveButtonText}>Save Photos</Text>
          </TouchableOpacity>
        </View>
        {selectedItem && (
          <EditPhotoDetailsModal
            visible={detailsModalVisible}
            photo={selectedItem}
            onSave={handleItemSave}
            onClose={() => setDetailsModalVisible(false)}
            isPromotion={isPromotion}
            onDelete={handleRemoveItem} // ✅ delete removes from draft
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    marginTop: 85,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  gridContainer: {
    flex: 1,
    position: "relative",
  },
  mediaThumbnail: {
    width: columnWidth,
    height: columnWidth,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  draggableItem: {
    position: "absolute",
    width: columnWidth,
    height: columnWidth,
    borderRadius: 8,
    marginBottom: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    marginBottom: 30,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#888",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    marginRight: 10,
  },
  cancelButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "teal",
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
    marginLeft: 10,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
});
