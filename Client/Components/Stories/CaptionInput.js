import React, { useEffect, useRef } from 'react';
import { TextInput, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const screenHeight = Dimensions.get('window').height;

const CaptionInput = ({ caption, onChange, onFocus, onBlur, onDragEnd }) => {
  const inputRef = useRef(null);
  const y = useSharedValue(caption.y ?? screenHeight * 0.4);

  useEffect(() => {
    // Animate into position
    y.value = withTiming(screenHeight * 0.4, { duration: 200 });

    // Focus input after animation delay
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 250);

    return () => clearTimeout(timeout);
  }, []);

  const gesture = Gesture.Pan()
  .onChange(event => {
    'worklet';
    const nextY = y.value + event.changeY;
    y.value = Math.max(40, Math.min(screenHeight - 100, nextY));
  })
  .onEnd(() => {
    runOnJS(onDragEnd)?.(caption.id, y.value);
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.captionWrapper, animatedStyle]}>
        <TextInput
          ref={inputRef}
          style={styles.captionInput}
          value={caption.text}
          onChangeText={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          scrollEnabled={false}
          multiline
        />
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  captionWrapper: {
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 15,
  },
  captionInput: {
    fontSize: 24,
    color: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
  },
});

export default CaptionInput;
