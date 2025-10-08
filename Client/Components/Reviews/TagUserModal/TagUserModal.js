import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { Avatar } from 'react-native-paper';
import useSlideDownDismiss from '../../../utils/useSlideDown';
import Notch from '../../Notch/Notch';
import profilePicPlaceholder from '../../../assets/pics/profile-pic-placeholder.jpg';
import { useSelector } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import SelfTagActionSheet from './SelfTagActionSheet';

const ROW_HEIGHT = 72;

const TagUserModal = ({
  visible,
  onClose,
  taggedUsers = [],             // [{ userId, fullName, profilePicUrl }]
  isFollowingMap,               // optional: { [userId]: true/false }
  getIsFollowing,               // optional: (userId) => boolean
  onFollowToggle,               // (user) => void
  onViewProfile,                // (user) => void
  onRemoveSelfTag,              // () => Promise|void  (POST-WIDE remove)
  onHideFromProfile,            // () => Promise|void
  item,
  photoId,                      // only set when this list is for a specific photo
  title = 'Tagged in this photo',
}) => {
  const currentUser = useSelector(selectUser);
  const currentUserId = currentUser?.id;
  const postType = item?.type || item?.psotType;
  const postId = item?._id || item?.id;
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

  const [selfActionsVisible, setSelfActionsVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      animateIn();
    } else {
      (async () => {
        await animateOut();
        onClose?.();
      })();
    }
  }, [visible]);

  const openSelfActions = () => setSelfActionsVisible(true);

  const keyExtractor = (item, i) => String(item?.userId || i);

  const renderItem = ({ item }) => {
    const isSelf =
      item?.userId != null &&
      currentUserId != null &&
      String(item.userId) === String(currentUserId);

    const isFollowing =
      typeof getIsFollowing === 'function'
        ? !!getIsFollowing(item.userId)
        : !!isFollowingMap?.[item.userId];

    const handlePressRow = () => {
      if (isSelf) {
        openSelfActions();
      } else {
        onViewProfile?.(item);
      }
    };

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePressRow}
        style={styles.row}
      >
        <Avatar.Image
          size={44}
          source={item.profilePicUrl ? { uri: item.profilePicUrl } : profilePicPlaceholder}
          style={{ backgroundColor: '#ccc', marginRight: 12 }}
        />
        <View style={styles.rowCenter}>
          <Text style={styles.name} numberOfLines={1}>
            {item.fullName || 'User'}
          </Text>
        </View>
        <View style={styles.actionsInline}>
          {!isSelf && (
            <TouchableOpacity
              onPress={() => onFollowToggle?.(item)}
              style={[styles.primaryBtnSm, isFollowing && styles.secondaryBtnSm]}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnSmText, isFollowing && styles.secondaryBtnSmText]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const getItemLayout = (_, index) => ({
    length: ROW_HEIGHT,
    offset: ROW_HEIGHT * index,
    index,
  });

  // Close behavior: if sheet is open, close it first; otherwise close modal
  const handleOverlayPress = useCallback(async () => {
    if (selfActionsVisible) {
      setSelfActionsVisible(false);
      return;
    }
    await animateOut();
  }, [selfActionsVisible]);

  // Post-wide actions keep your existing flow (close sheet + modal after)
  const handleRemoveSelfTag = async () => {
    try {
      await onRemoveSelfTag?.();
    } finally {
      setSelfActionsVisible(false);
      await animateOut();
      onClose?.();
    }
  };

  const handleHideFromProfile = async () => {
    try {
      await onHideFromProfile?.();
    } finally {
      setSelfActionsVisible(false);
      await animateOut();
      onClose?.();
    }
  };

  return (
    <Modal transparent visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={handleOverlayPress}>
        <Animated.View style={styles.modalOverlay}>
          <GestureDetector gesture={gesture}>
            <TouchableWithoutFeedback>
              <Animated.View style={[styles.modalContent, animatedStyle]}>
                <Notch />
                <Text style={styles.title}>{title}</Text>

                <FlatList
                  data={taggedUsers}
                  keyExtractor={keyExtractor}
                  renderItem={renderItem}
                  getItemLayout={getItemLayout}
                  ItemSeparatorComponent={() => <View style={styles.sep} />}
                  contentContainerStyle={{ paddingBottom: 16 }}
                  keyboardShouldPersistTaps="handled"
                />
              </Animated.View>
            </TouchableWithoutFeedback>
          </GestureDetector>

          {/* Self-actions sheet sits above everything else inside the Modal */}
          <SelfTagActionSheet
            visible={selfActionsVisible}
            onClose={() => setSelfActionsVisible(false)}
            onRemoveSelfTag={handleRemoveSelfTag}     // post-wide remove (parent-controlled)
            onHideFromProfile={handleHideFromProfile}
            postType={postType}                       // ⬅️ pass identifiers for photo untag
            postId={postId}
            photoId={photoId}                         // if provided, sheet shows "Remove from this photo"
          />
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    minHeight: 220,
    paddingBottom: 28,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
  },
  rowCenter: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 5,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e6e6e6',
  },
  actionsInline: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnSm: {
    backgroundColor: '#1e88e5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnSmText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryBtnSm: {
    backgroundColor: '#e3f2fd',
  },
  secondaryBtnSmText: {
    color: '#1565c0',
  },
});

export default TagUserModal;
