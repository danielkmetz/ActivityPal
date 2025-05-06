import React, { useState } from 'react';
import { Modal, View, Image, TouchableOpacity, StyleSheet, Dimensions, Text, Animated, TouchableWithoutFeedback } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import BottomCommentsModal from './BottomCommentsModal';

const { width, height } = Dimensions.get('window');

const FullScreenPhotoModal = ({
  visible,
  onClose,
  photo,
  review,
  lastTapRef,
  likedAnimations,
  toggleTaggedUsers,
  handleLikeWithAnimation,
}) => {
  const isInteractive = true;
  const [ commentsVisible, setCommentsVisible ] = useState(false);
  const user = useSelector(selectUser);
  const userId = user?.id;

  const animation = likedAnimations?.[review._id] || new Animated.Value(0);
  const hasLiked = Array.isArray(review.likes) && review.likes.some((like) => like.userId === userId);

  const handleTap = () => {
    if (!isInteractive) return;

    const now = Date.now();

    if (
      lastTapRef.current[review._id] &&
      now - lastTapRef.current[review._id] < 300
    ) {
      handleLikeWithAnimation(review.type, review._id);
      lastTapRef.current[review._id] = 0;
    } else {
      lastTapRef.current[review._id] = now;

      setTimeout(() => {
        if (lastTapRef.current[review._id] === now) {
          toggleTaggedUsers(photo.photoKey); // ✅ Open the photo fullscreen
          lastTapRef.current[review._id] = 0;
        }
      }, 200);
    }
  };

  const handleLike = () => {
    handleLikeWithAnimation(review.type, review._id);
  };

  const handleCloseComments = () => {
    setCommentsVisible(false);
  };

  const handleOpenComments = () => {
    setCommentsVisible(true);
  };

  if (!photo) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={styles.overlay}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={30} color="white" />
          </TouchableOpacity>
          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity onPress={handleOpenComments} style={styles.iconButton}>
              <MaterialCommunityIcons name="comment-outline" size={28} color="white" />
              <Text style={styles.countText}>{review.comments.length}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => handleLikeWithAnimation(review.type, review._id)}>
            <MaterialCommunityIcons
              name={hasLiked ? "thumb-up" : "thumb-up-outline"}
              size={28}
              color={hasLiked ? "#009999" : "white"}
            />
              <Text style={styles.countText}>{review.likes.length}</Text>
            </TouchableOpacity>
          </View>
          <Image source={{ uri: photo.url || photo.uri }} style={styles.fullImage} />
          {isInteractive && (
            <Animated.View style={[styles.likeOverlay, { opacity: animation }]}>
              <MaterialCommunityIcons name="thumb-up" size={80} color="#80E6D2" />
            </Animated.View>
          )}
        </View>
      </TouchableWithoutFeedback>
      
      <BottomCommentsModal 
        visible={commentsVisible}
        onClose={handleCloseComments}
        review={review}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: width,
    height: height,
    resizeMode: 'contain',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 2,
  },
  actionsContainer: {
    position: 'absolute',
    right: 20,
    top: height / 2 + 140,
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButton: {
    marginVertical: 15,
    alignItems: 'center'
  },
  countText: {
    color: 'white',
    fontSize: 14,
    marginTop: 4,
  },
  likeOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -40 }, { translateY: -40 }], // Center the thumbs-up
    opacity: 0, // Initially hidden
},
});

export default FullScreenPhotoModal;
