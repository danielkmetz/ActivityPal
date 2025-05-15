import React, { useRef, useState, useEffect } from 'react';
import {
  Animated,
  PanResponder,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video } from 'expo-av';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function StoryViewer() {
  const navigation = useNavigation();
  const route = useRoute();
  const { stories = [], startIndex = 0 } = route.params;

  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const story = stories[currentIndex];
  const mediaUrl = story?.mediaUrl || story?.mediaUploadUrl;

  const translateY = useRef(new Animated.Value(0)).current;
  const scale = translateY.interpolate({
    inputRange: [0, SCREEN_HEIGHT],
    outputRange: [1, 0.5],
    extrapolate: 'clamp',
  });
  const opacity = translateY.interpolate({
    inputRange: [0, SCREEN_HEIGHT / 2],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 10,
      onPanResponderMove: (_, gesture) => translateY.setValue(gesture.dy),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 150) {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
          }).start(() => navigation.goBack());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      navigation.goBack();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleNext();
    }, 4000); // auto-advance after 4s
    return () => clearTimeout(timer);
  }, [currentIndex]);

  if (!story?.mediaKey) {
    return (
      <View style={styles.container}>
        <Text style={{ color: 'white' }}>Invalid story data</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Tap Left/Right to Skip */}
      <Pressable style={styles.leftTapZone} onPress={handlePrev} />
      <Pressable style={styles.rightTapZone} onPress={handleNext} />

      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      {/* Status Bar */}
      <View style={styles.progressBarContainer}>
        {stories.map((_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              {
                flex: 1,
                backgroundColor: i < currentIndex
                  ? 'rgba(255,255,255,0.8)'
                  : i === currentIndex
                  ? 'white'
                  : 'rgba(255,255,255,0.3)',
              },
            ]}
          />
        ))}
      </View>

      {/* Media */}
      {story.mediaType === 'video' ? (
        <Video
          source={{ uri: mediaUrl }}
          shouldPlay
          resizeMode="cover"
          useNativeControls={false}
          isMuted
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 2,
    padding: 10,
  },
  closeText: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    flexDirection: 'row',
    position: 'absolute',
    top: 60,
    left: 10,
    right: 10,
    height: 4,
    zIndex: 3,
    gap: 4,
  },
  segment: {
    borderRadius: 2,
    height: 4,
  },
  leftTapZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.3,
    zIndex: 5,
  },
  rightTapZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.3,
    zIndex: 5,
  },
});
