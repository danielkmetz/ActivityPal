import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDispatch, useSelector } from 'react-redux';
import useSlideDownDismiss from '../../../utils/useSlideDown';
import { hideTaggedPost } from '../../../Slices/ReviewsSlice';
import { removeSelfFromPhoto, selectSelfTagStatus, removeSelfFromPost } from '../../../Slices/RemoveTagsSlice';

export default function SelfTagActionSheet({
  visible,
  onClose,              // called after the sheet fully closes
  postType,
  postId,
  photoId,
}) {
  const dispatch = useDispatch();
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
  const status = useSelector((s) => selectSelfTagStatus(s, postType, postId));
  const isBusy = status === 'pending';

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

  if (!visible) return null;

  const handleRemoveFromPhoto = async () => {
    try {
      await dispatch(
        removeSelfFromPhoto({ postType, postId, photoId })
      ).unwrap();

      await animateOut();
    } catch (e) {
      console.warn('Failed to remove tag from photo', e);
    }
  };

  const handleRemoveFromPost = async () => {
    try {
      await dispatch(
        removeSelfFromPost({ postType, postId })
      ).unwrap();

      await animateOut();
    } catch (e) {
      console.warn('Failed to remove tag from post', e);
    }
  };

  const handleHideFromProfile = async () => {
    try {
      await dispatch(hideTaggedPost({ postType, postId})).unwrap();

      await animateOut();
    } catch (e) {
      console.warn('Failed to hide from profile', e);
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={animateOut}>
        <Animated.View style={styles.selfOverlay}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.sheetContainer, animatedStyle]}>
              <View style={styles.sheetGroup}>
                <View style={styles.sheetHandle} />
                {photoId ? (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={handleRemoveFromPhoto}
                      style={[styles.sheetItem, styles.sheetItemFirst, isBusy && { opacity: 0.6 }]}
                      disabled={isBusy}
                    >
                      <Text style={[styles.sheetItemText]}>
                        {isBusy ? 'Removing…' : 'Remove me from this photo'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.sheetDivider} />
                  </>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleRemoveFromPost}
                  style={[styles.sheetItem, !photoId && styles.sheetItemFirst, isBusy && { opacity: 0.6 }]}
                  disabled={isBusy}
                >
                  <Text style={[styles.sheetItemText, styles.destructiveText]}>
                    Remove me from post
                  </Text>
                </TouchableOpacity>
                <View style={styles.sheetDivider} />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleHideFromProfile}
                  style={[styles.sheetItem, isBusy && { opacity: 0.6 }]}
                  disabled={isBusy}
                >
                  <Text style={styles.sheetItemText}>
                    Hide from my profile
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={animateOut}
                style={[styles.sheetGroup, styles.cancelGroup]}
              >
                <Text style={[styles.sheetItemText, styles.cancelText]}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  selfOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
  },
  sheetGroup: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 8,
    marginBottom: 8,
  },
  cancelGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E1E1E1',
    marginTop: 8,
    marginBottom: 6,
  },
  sheetItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetItemFirst: {
    paddingTop: 12,
  },
  sheetItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  destructiveText: {
    color: '#E33',
    fontWeight: '700',
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E6E6E6',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '700',
  },
});
