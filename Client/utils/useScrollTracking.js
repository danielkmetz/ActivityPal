import { useRef } from 'react';
import { Animated, Platform } from 'react-native';

export const HEADER_HEIGHT = 130;
export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 90 : 70;
export const MIN_VELOCITY_TO_TRIGGER = 0.8;
export const MIN_SCROLL_DELTA = 20;

export default function useScrollTracking() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const isHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);
  const lastScrollTime = useRef(Date.now());

  const tabBarTranslateY = headerTranslateY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0],
    outputRange: [TAB_BAR_HEIGHT, 0],
    extrapolate: 'clamp',
  });

  const customNavTranslateY = headerTranslateY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0],
    outputRange: [150, 0], // adjust if needed
    extrapolate: 'clamp',
  });

  const customHeaderTranslateY = headerTranslateY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0],
    outputRange: [-180, 0],
    extrapolate: 'clamp',
  });

  const handleScroll = (event, setIsAtEnd) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const layoutHeight = event.nativeEvent.layoutMeasurement.height;
    const currentTime = Date.now();
    const deltaY = currentY - lastScrollY.current;
    const deltaTime = currentTime - lastScrollTime.current;

    const velocity = deltaY / (deltaTime || 1);

    lastScrollY.current = currentY;
    lastScrollTime.current = currentTime;

    const isNearTop = currentY <= 0;
    const isReallyAtTop = currentY <= 35;

    if (velocity > MIN_VELOCITY_TO_TRIGGER && !isNearTop && isHeaderVisible.current) {
      Animated.timing(headerTranslateY, {
        toValue: -HEADER_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
      isHeaderVisible.current = false;
    } else if (
      velocity < -MIN_VELOCITY_TO_TRIGGER &&
      Math.abs(deltaY) > MIN_SCROLL_DELTA &&
      !isHeaderVisible.current
    ) {
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      isHeaderVisible.current = true;
    } else if (isReallyAtTop && !isHeaderVisible.current) {
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
      isHeaderVisible.current = true;
    }

    if (setIsAtEnd) {
      const isAtBottom = currentY + layoutHeight >= contentHeight - 100;
      setIsAtEnd(isAtBottom);
    }
  };

  const resetHeaderAndTab = () => {
    Animated.timing(headerTranslateY, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    isHeaderVisible.current = true;
  };

  return {
    scrollY,
    headerTranslateY,
    tabBarTranslateY,
    customNavTranslateY,
    customHeaderTranslateY,
    handleScroll,
    resetHeaderAndTab,
  };
}
