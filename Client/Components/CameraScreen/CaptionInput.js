import React, { useEffect, useRef, useMemo } from 'react';
import { TextInput, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const screenHeight = Dimensions.get('window').height;

const CaptionInput = ({
  caption,            // { id, text, y, fontSize? }
  fontSize,           // ← parent-controlled size
  textStyle,          // optional extra styles from parent
  onChange,
  onFocus,
  onBlur,
  onDragEnd,
}) => {
  const inputRef = useRef(null);

  // pick an initial Y that respects any saved position
  const initialY = useMemo(
    () => (typeof caption.y === 'number' ? caption.y : screenHeight * 0.4),
    [caption.y]
  );

  const y = useSharedValue(initialY);

  useEffect(() => {
    // Smoothly animate to initial position (no forced center override)
    y.value = withTiming(initialY, { duration: 200 });

    // Focus shortly after mount
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 250);
    return () => clearTimeout(timeout);
  }, [initialY, y]);

  // Drag to reposition (clamped within screen)
  const gesture = Gesture.Pan()
    .onChange((event) => {
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

  // Optional: scale padding with font size for a nicer “banner” feel
  const dynamicPaddingV = Math.round((fontSize || 16) * 0.2);
  const dynamicMinHeight = Math.round((fontSize || 16) * 1.7);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.captionWrapper, animatedStyle]} collapsable={false}>
        <TextInput
          ref={inputRef}
          value={caption.text}
          onChangeText={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          scrollEnabled={false}
          multiline
          placeholderTextColor="rgba(255,255,255,0.7)"
          // Put incoming styles LAST so fontSize overrides defaults every time
          style={[
            styles.captionInput,
            textStyle,
            { fontSize, paddingVertical: dynamicPaddingV, minHeight: dynamicMinHeight },
          ]}
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
    color: '#fff',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    textAlign: 'center',
  },
});

export default CaptionInput;