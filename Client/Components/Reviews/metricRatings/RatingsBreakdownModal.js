import React, { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Notch from '../../Notch/Notch';
import useSlideDownDismiss from '../../../utils/useSlideDown';

const RatingsBreakdownModal = ({ visible, onClose, ratings }) => {
  const {
    rating,
    priceRating,
    serviceRating,
    atmosphereRating,
    wouldRecommend,
  } = ratings;

  const fadeAnim = useSharedValue(0);
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

  useEffect(() => {
    fadeAnim.value = withTiming(visible ? 1 : 0, { duration: 100 });

    if (visible) {
      animateIn();
    } else {
      (async () => {
        await animateOut();
        onClose();
      })();
    }
  }, [visible]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fadeAnim.value,
  }));

  return (
    <Modal transparent visible={visible} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={animateOut}>
        <Animated.View style={[styles.modalOverlay, fadeStyle]}>
          <GestureDetector gesture={gesture}>
            <TouchableWithoutFeedback>
              <Animated.View style={[styles.modalContent, animatedStyle]}>
                <Notch />
                <Text style={styles.modalTitle}>Ratings Breakdown</Text>

                <View style={styles.row}>
                  <Text style={styles.label}>Overall:</Text>
                  <View style={styles.icons}>
                    {Array.from({ length: rating }).map((_, i) => (
                      <MaterialCommunityIcons key={i} name="star" size={18} color="gold" />
                    ))}
                  </View>
                </View>

                {priceRating != null && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Price:</Text>
                    <Text style={styles.value}>{'$'.repeat(priceRating)}</Text>
                  </View>
                )}

                {serviceRating != null && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Service:</Text>
                    <Text style={styles.value}>{serviceRating}</Text>
                  </View>
                )}

                {atmosphereRating != null && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Atmosphere:</Text>
                    <Text style={styles.value}>{atmosphereRating}</Text>
                  </View>
                )}

                {wouldRecommend != null && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Would Recommend:</Text>
                    <MaterialCommunityIcons
                      name={wouldRecommend ? 'thumb-up' : 'thumb-down'}
                      size={18}
                      color={wouldRecommend ? '#4caf50' : '#f44336'}
                    />
                  </View>
                )}
              </Animated.View>
            </TouchableWithoutFeedback>
          </GestureDetector>
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
    minHeight: 180,
    paddingBottom: 100,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  value: {
    fontSize: 15,
    fontWeight: '500',
    color: '#444',
  },
  icons: {
    flexDirection: 'row',
  },
});

export default RatingsBreakdownModal;
