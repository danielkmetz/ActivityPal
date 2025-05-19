import React, { useState, useEffect, } from "react";
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import EditPhotoDetailsModal from "./EditPhotoDetailsModal";
import VideoThumbnail from "../Reviews/VideoThumbnail";

const { width: screenWidth } = Dimensions.get("window");
const columnMargin = 5;
const numColumns = 3;
const columnWidth = (screenWidth - columnMargin * (numColumns + 1)) / numColumns;

function DraggablePhoto({ photo, index, positions, onSwap, onPress }) {
  if (!positions[index]) return null;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (positions[index]) {
      translateX.value = withSpring(positions[index].x);
      translateY.value = withSpring(positions[index].y);
    }
  }, [positions, index]);

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX + positions[index].x;
      translateY.value = e.translationY + positions[index].y;
    })
    .onEnd(() => {
      const newIndex = positions.findIndex(
        (pos) =>
          Math.abs(pos.x - translateX.value) < columnWidth / 2 &&
          Math.abs(pos.y - translateY.value) < columnWidth / 2
      );
      if (newIndex !== -1 && newIndex !== index) {
        runOnJS(onSwap)(index, newIndex);
      } else {
        translateX.value = withSpring(positions[index].x);
        translateY.value = withSpring(positions[index].y);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const cleanUrl = (photo.uri || photo.url || photo.photoKey || "").split("?")[0];
  const isVideo = cleanUrl.toLowerCase().endsWith(".mp4") || cleanUrl.toLowerCase().endsWith(".mov");

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.draggableItem, animatedStyle]}>
        <TouchableWithoutFeedback onPress={() => onPress(photo)}>
          {isVideo ? (
            <View>
              <VideoThumbnail file={photo} width={columnWidth} height={columnWidth} />
            </View>
          ) : (
            <Image
              source={{ uri: photo.uri || photo.url }}
              style={styles.photoThumbnail}
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
  photos,
  onSave,
  onClose,
  photoList,
  setPhotoList,
  isPromotion,
  onDelete,
}) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [shouldRenderGrid, setShouldRenderGrid] = useState(false);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    if (visible) {
      const timeout = setTimeout(() => setShouldRenderGrid(true), 100);
      return () => clearTimeout(timeout);
    } else {
      setShouldRenderGrid(false);
    }
  }, [visible]);

  useEffect(() => {
    if (photos) {
      setPhotoList(photos);
    }
  }, [photos]);

  useEffect(() => {
    const updatedPositions = photoList.map((_, index) => {
      const row = Math.floor(index / numColumns);
      const col = index % numColumns;
      return {
        x: col * (columnWidth + columnMargin) + columnMargin,
        y: row * (columnWidth + columnMargin) + columnMargin,
      };
    });
    setPositions(updatedPositions);
  }, [photoList]);

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
    setDetailsModalVisible(true);
  };

  const handlePhotoSave = (updatedPhoto) => {
    setPhotoList((prev) =>
      prev.map((photo) => {
        const isSamePhoto =
          (photo._id && updatedPhoto._id && photo._id === updatedPhoto._id) ||
          (photo.photoKey && updatedPhoto.photoKey && photo.photoKey === updatedPhoto.photoKey) ||
          (photo.uri && updatedPhoto.uri && photo.uri === updatedPhoto.uri);
        return isSamePhoto ? updatedPhoto : photo;
      })
    );
  };

  const swapPhotos = (fromIndex, toIndex) => {
    const updatedList = [...photoList];
    const moved = updatedList.splice(fromIndex, 1)[0];
    updatedList.splice(toIndex, 0, moved);
    setPhotoList(updatedList);
  };

  const handleSavePhotos = () => {
    onSave(photoList); // this now reflects the correct order AND updates
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <Text style={styles.title}>Edit Photos</Text>

        {shouldRenderGrid && (
          <View style={styles.gridContainer}>
            {photoList.map((photo, index) => (
              <DraggablePhoto
                key={photo._id || photo.photoKey || photo.uri || index}
                photo={photo}
                index={index}
                positions={positions}
                onSwap={swapPhotos}
                onPress={handlePhotoClick}
              />
            ))}
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSavePhotos}>
            <Text style={styles.saveButtonText}>Save Photos</Text>
          </TouchableOpacity>
        </View>

        {selectedPhoto && (
          <EditPhotoDetailsModal
            visible={detailsModalVisible}
            photo={selectedPhoto}
            onSave={handlePhotoSave}
            onClose={() => setDetailsModalVisible(false)}
            isPromotion={isPromotion}
            onDelete={onDelete}
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
  photoThumbnail: {
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
