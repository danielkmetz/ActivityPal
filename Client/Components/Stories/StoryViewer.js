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
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video } from 'expo-av';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import { deleteStory } from '../../Slices/StoriesSlice';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function StoryViewer() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();
  const user = useSelector(selectUser);
  const userId = user?.id;
  const { stories = [], startIndex = 0 } = route.params;

  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [duration, setDuration] = useState(4000);
  const [paused, setPaused] = useState(false);
  const [videoUri, setVideoUri] = useState(null);

  const story = stories[currentIndex];
  const mediaUrl = story?.mediaUrl || story?.mediaUploadUrl;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const progress = useRef(stories.map(() => new Animated.Value(0))).current;
  const animationRef = useRef(null);
  const hasSyncedRef = useRef(false);
  const previousStoryRef = useRef(null);

  console.log("📌 currentIndex:", currentIndex);
console.log(story);
useEffect(() => {
  if (story?.mediaUrl) {
    setVideoUri(`${story.mediaUrl}&cacheBuster=${Date.now()}`); // 👈 forces video refresh
  }
}, [story?.mediaUrl]);

  useEffect(() => {
    previousStoryRef.current = story;
  }, [currentIndex]);

  const startProgressAnimation = (ms) => {
    console.log(`🚀 Starting animation for index ${currentIndex} with duration ${ms}`);
    progress[currentIndex].setValue(0);
    animationRef.current = Animated.timing(progress[currentIndex], {
      toValue: 1,
      duration: ms,
      useNativeDriver: false,
    });
    animationRef.current.start(({ finished }) => {
      console.log(`🎞️ Animation finished=${finished} for index ${currentIndex}`);
      if (finished) handleNext();
    });
  };

  const resetAllBars = () => {
    console.log('🔁 Resetting progress bars for index', currentIndex);
    progress.forEach((bar, i) => {
      bar.setValue(i < currentIndex ? 1 : 0);
    });
  };

  const handleNext = () => {
    console.log('👉 Next tapped');
    animationRef.current?.stop();
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      console.log('🏁 Reached end of stories, closing');
      navigation.goBack();
    }
  };

  const handlePrev = () => {
    console.log('👈 Previous tapped');
    animationRef.current?.stop();
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  useEffect(() => {
    resetAllBars();
    hasSyncedRef.current = false;
    fadeAnim.setValue(0);

    const defaultDuration = story.mediaType === 'video' ? 10000 : 4000;
    setDuration(defaultDuration);

    if (!paused && story.mediaType !== 'video') {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      startProgressAnimation(defaultDuration);
    }

    return () => {
      animationRef.current?.stop();
    };
  }, [currentIndex, paused]);

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
          transform: [{ translateY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable style={styles.leftTapZone} onPress={handlePrev} />
      <Pressable style={styles.rightTapZone} onPress={handleNext} />

      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      {/* Status Bar */}
      <View style={styles.progressBarContainer}>
        {stories.map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.segment,
              {
                flex: 1,
                marginHorizontal: 2,
                backgroundColor: i < currentIndex ? 'white' : 'rgba(255,255,255,0.3)',
                transform: [{ scaleX: progress[i] }],
                transformOrigin: 'left',
              },
            ]}
          />
        ))}
      </View>

      {/* Media */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          {story.mediaType === 'video' ? (
            <Video
              key={mediaUrl}
              source={{ uri: mediaUrl }}
              resizeMode="cover"
              shouldPlay
              isMuted
              style={StyleSheet.absoluteFill}
              onPlaybackStatusUpdate={(status) => {
                console.log('🎥 Video status:', {
                  isLoaded: status.isLoaded,
                  durationMillis: status.durationMillis,
                  positionMillis: status.positionMillis,
                });

                if (!status.isLoaded || hasSyncedRef.current) return;

                if (status.durationMillis && status.positionMillis < 500) {
                  console.log('📏 Syncing animation with video duration:', status.durationMillis);
                  hasSyncedRef.current = true;
                  animationRef.current?.stop();
                  startProgressAnimation(status.durationMillis);

                  // Show the video by fading in
                  Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                  }).start();
                }
              }}
            />
          ) : (
            <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
        </Animated.View>

        {story.user?._id === userId && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => {
              Alert.alert(
                'Delete Story',
                'Are you sure you want to delete this story? This action cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await dispatch(deleteStory(story._id)).unwrap();
                        navigation.goBack();
                      } catch (err) {
                        console.error('🗑️ Failed to delete story:', err);
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Ionicons name="trash" size={26} color="white" />
          </TouchableOpacity>
        )}
      </View>

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
  },
  segment: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
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
  deleteButton: {
    position: 'absolute',
    bottom: 60,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 10,
  },
});
