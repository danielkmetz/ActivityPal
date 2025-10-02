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
  Easing,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import StoryMediaRenderer from './StoryMediaRenderer';
import DeleteStoryButton from './DeleteStoryButton';
import { isVideo } from '../../utils/isVideo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function StoryViewer() {
  const navigation = useNavigation();
  const route = useRoute();
  const user = useSelector(selectUser);
  const userId = user?.id;
  const { stories = [], startIndex = 0 } = route.params;
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [duration, setDuration] = useState(4000);
  const [paused, setPaused] = useState(false);
  const [videoUri, setVideoUri] = useState(null);
  const [segIndex, setSegIndex] = useState(0);
  const story = stories[currentIndex];
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const imageWithCaptionsRef = useRef(null);
  const progress = useRef(stories.map(() => new Animated.Value(0))).current;
  const animationRef = useRef(null);
  const previousStoryRef = useRef(null);
  const elapsedTimeRef = useRef(0);       // time passed before pause
  const animationStartTimeRef = useRef(0); // timestamp when animation started
  const currentAnimRef = useRef(null);     // to hold current animation instance
  const captions = story?.captions || [];
  const videoCheck = isVideo(story);

  const videoSegments = Array.isArray(story?.segments) ? story.segments : [];
  const isMulti = story?.mediaType === 'video' && videoSegments.length > 0;
  const currentSegment = isMulti ? videoSegments[segIndex] : null;
  const currentIndexRef = useRef(currentIndex);
  const videoTweenRef = useRef(null);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const effectiveMediaUri =
    story?.mediaType === 'video' ? (videoUri ?? story.mediaUrl) : story?.mediaUrl;

  useEffect(() => {
    if (videoCheck && story?.mediaUrl) {
      setVideoUri(story.mediaUrl);
    } else {
      setVideoUri(null);       // ← important
    }
    setSegIndex(0);            // reset segments on story change
  }, [currentIndex, videoCheck, story?.mediaUrl]);

  useEffect(() => {
    previousStoryRef.current = story;
  }, [currentIndex]);

  const startProgressAnimation = (ms, fromValue = 0) => {
    const remaining = ms * (1 - fromValue);

    progress[currentIndex].setValue(fromValue);
    animationStartTimeRef.current = Date.now();
    elapsedTimeRef.current = ms * fromValue;

    currentAnimRef.current = Animated.timing(progress[currentIndex], {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });

    currentAnimRef.current.start(({ finished }) => {
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
    fadeAnim.setValue(0);

    // stop any leftover tweens/timers when changing stories
    videoTweenRef.current?.stop?.();
    videoTweenRef.current = null;
    currentAnimRef.current?.stop?.();

    const defaultDuration = story.mediaType === 'video' ? 10000 : 4000;
    setDuration(defaultDuration);

    elapsedTimeRef.current = 0;
    animationStartTimeRef.current = Date.now();

    if (story.mediaType !== 'video') {
      if (!paused) {
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        startProgressAnimation(defaultDuration);
      }
    } else {
      // videos: let onVideoProgress drive the bar
      progress[currentIndex].setValue(0); // reset current segment fill
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }

    return () => {
      currentAnimRef.current?.stop?.();
      videoTweenRef.current?.stop?.();
    };
  }, [currentIndex, story?.mediaType]);

  useEffect(() => {
    if (story.mediaType === 'video') return;

    if (paused) {
      currentAnimRef.current?.stop();

      // calculate elapsed time
      const now = Date.now();
      elapsedTimeRef.current += now - animationStartTimeRef.current;
    } else {
      const fromValue = progress[currentIndex]._value ?? 0;
      const remainingDuration = duration - elapsedTimeRef.current;

      if (remainingDuration > 0) {
        startProgressAnimation(duration, fromValue);
      }
    }
  }, [paused]);

  useEffect(() => {
    videoTweenRef.current?.stop?.();
    videoTweenRef.current = null;
  }, [currentIndex]);

  const tweenToProgress = (fraction) => {
    if (pausedRef.current) return;
    const idx = currentIndexRef.current ?? 0;
    const node = progress[idx];
    if (!node) return;

    const v = Math.max(0, Math.min(1, fraction));
    videoTweenRef.current?.stop?.(); // cancel previous micro-tween
    videoTweenRef.current = Animated.timing(node, {
      toValue: v,
      duration: 80,          // try 60–120ms to taste
      easing: Easing.linear, // linear looks best for a progress bar
      useNativeDriver: false // width interpolation needs JS driver
    });
    videoTweenRef.current.start();
  };

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
      <Pressable
        style={StyleSheet.absoluteFill}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
      >
        <Pressable style={styles.leftTapZone} onPress={handlePrev} />
        <Pressable style={styles.rightTapZone} onPress={handleNext} />
        <TouchableOpacity style={styles.closeButton} onPress={goBack}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        {/* Status Bar */}
        <View style={styles.progressBarContainer}>
          {stories.map((_, i) => {
            const widthAnim = progress[i].interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            });

            const isDone = i < currentIndex;
            const isCurrent = i === currentIndex;

            return (
              <View key={i} style={[styles.segmentTrack, { flex: 1, marginHorizontal: 2 }]}>
                {/* done segments: solid white */}
                {isDone && <View style={[styles.segmentFill, StyleSheet.absoluteFill]} />}

                {/* current segment: animated width */}
                {isCurrent && (
                  <Animated.View
                    style={[styles.segmentFill, { width: widthAnim, height: '100%', position: 'absolute', left: 0, top: 0 }]}
                  />
                )}
              </View>
            );
          })}
        </View>
        {/* Media */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              story.mediaType === 'video' ? null : { opacity: fadeAnim },
            ]}
          >
            <StoryMediaRenderer
              isSharedPost={!!story.original}
              paused={paused}
              post={story?.original}
              mediaUri={effectiveMediaUri}
              currentSegment={currentSegment} // or your segment logic if needed
              mediaType={story?.mediaType}
              segments={videoSegments} // or [] if unused here
              currentSegmentIndex={segIndex} // default value
              setCurrentSegmentIndex={setSegIndex} // no-op if unused
              captions={story?.captions || []}
              isSubmitting={false}
              imageWithCaptionsRef={imageWithCaptionsRef}
              onPressIn={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
              onVideoProgress={tweenToProgress}
              onVideoEndedLastSegment={() => {
                // when the final segment ends, go to the next story
                handleNext();
              }}
            />
          </Animated.View>
          {captions?.map((caption, index) => (
            <View
              key={index}
              style={[styles.caption, { top: caption.y }]}
            >
              <Text
                style={{
                  fontSize: caption.fontSize || 16,
                  color: caption.color || 'white',
                  textAlign: 'center',
                }}
              >
                {caption.text}
              </Text>
            </View>
          ))}
          {story?.user?.id === userId && (
            <DeleteStoryButton
              storyId={story._id}
              onDelete={goBack}
            />
          )}
        </View>
      </Pressable>
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
  caption: {
    position: 'absolute',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  segmentTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)', // track
    overflow: 'hidden',
  },
  segmentFill: {
    backgroundColor: 'white',
    borderRadius: 2,
  },
});
