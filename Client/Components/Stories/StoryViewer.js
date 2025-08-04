import React, { useRef, useState, useEffect } from 'react';
import {
  Animated,
  PanResponder,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Pressable,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import { deleteStory } from '../../Slices/StoriesSlice';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import StoryMediaRenderer from './StoryMediaRenderer';

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
  const imageWithCaptionsRef = useRef(null);
  const progress = useRef(stories.map(() => new Animated.Value(0))).current;
  const animationRef = useRef(null);
  const hasSyncedRef = useRef(false);
  const previousStoryRef = useRef(null);

  useEffect(() => {
    if (story?.mediaUrl) {
      setVideoUri(`${story.mediaUrl}&cacheBuster=${Date.now()}`); // 👈 forces video refresh
    }
  }, [story?.mediaUrl]);

  useEffect(() => {
    previousStoryRef.current = story;
  }, [currentIndex]);

  const startProgressAnimation = (ms) => {
    progress[currentIndex].setValue(0);
    animationRef.current = Animated.timing(progress[currentIndex], {
      toValue: 1,
      duration: ms,
      useNativeDriver: false,
    });
    animationRef.current.start(({ finished }) => {
      if (finished) handleNext();
    });
  };

  const resetAllBars = () => {
    progress.forEach((bar, i) => {
      bar.setValue(i < currentIndex ? 1 : 0);
    });
  };

  const handleNext = () => {
    animationRef.current?.stop();
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      navigation.goBack();
    }
  };

  const handlePrev = () => {
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

  const goBack = () => {
    navigation.goBack();
  };

  // if (!story?.post && !story?.mediaUrl && !story?.mediaUploadUrl) {
  //   return (
  //     <View style={styles.container}>
  //       <Text style={{ color: 'white' }}>Invalid story data</Text>
  //     </View>
  //   );
  // }

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

      <TouchableOpacity style={styles.closeButton} onPress={goBack}>
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
          <StoryMediaRenderer
            isSharedPost={!!story.original}
            post={story.original}
            mediaUri={videoUri || story.mediaUrl}
            currentSegment={null} // or your segment logic if needed
            mediaType={story.mediaType}
            segments={[]} // or [] if unused here
            currentSegmentIndex={0} // default value
            setCurrentSegmentIndex={() => { }} // no-op if unused
            captions={story.captions || []}
            isSubmitting={false}
            imageWithCaptionsRef={imageWithCaptionsRef}
          />
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
                        goBack();
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
