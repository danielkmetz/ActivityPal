import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import Animated from 'react-native-reanimated';
import Notch from '../../Notch/Notch';
import useSlideDownDismiss from '../../../utils/useSlideDown';
import { GestureDetector } from 'react-native-gesture-handler';
import PostPreviewCard from '../PostPreviewCard';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import { selectProfilePic } from '../../../Slices/PhotosSlice';
import { createPost, updatePost } from '../../../Slices/PostsSlice';
import VideoThumbnail from '../VideoThumbnail';

export default function SharePostModal({
  visible,
  onClose,
  post,
  isEditing = false,
  setIsEditing,
}) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const profilePic = useSelector(selectProfilePic);
  const profilePicUrl = profilePic?.url || null;
  const sharedPost = isEditing ? post?.original : post;
  const details = post?.details || {};
  const replayUrl = details.vodUrl || details.playbackUrl || post?.playbackUrl || null;
  const isReplay = !!replayUrl && (post?.type === 'liveStream' || post?.type === 'hls');
  
  // event / promotion from feed or from /events-and-promos-nearby
  const isEventOrPromotion = useMemo(() => {
    const t = post?.type;
    const k = post?.kind;
    return (
      t === 'event' ||
      t === 'promotion' ||
      k === 'event' ||
      k === 'promotion'
    );
  }, [post]);

  const fullName = useMemo(() => {
    const first = user?.firstName ?? '';
    const last = user?.lastName ?? '';
    return [first, last].filter(Boolean).join(' ');
  }, [user?.firstName, user?.lastName]);

  const [comment, setComment] = useState('');
  const { gesture, animateIn, animateOut, animatedStyle } =
    useSlideDownDismiss(onClose);

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

  useEffect(() => {
    if (isEditing && post?.message) {
      setComment(post.message);
    } else if (isEditing && post?.caption) {
      setComment(post.caption);
    } else if (!isEditing) {
      setComment('');
    }
  }, [isEditing, post]);

  const handleSubmit = async () => {
    if (!post?._id) return;

    const trimmed = (comment ?? '').trim();
    const caption = trimmed || null;
    const currentUserId = user?._id || user?.id;

    try {
      if (isEditing) {
        const isShared =
          post?.type === 'sharedPost' || post?.canonicalType === 'sharedPost';
        const isLivePost =
          post?.type === 'liveStream' || post?.canonicalType === 'liveStream';

        if (isShared || isLivePost) {
          await dispatch(
            updatePost({
              postId: post._id,
              updates: { message: caption },
            })
          ).unwrap();
        } else {
          console.warn(
            '[SharePostModal] Unsupported type in edit mode:',
            post?.type
          );
          return;
        }

        setIsEditing(false);
      } else {
        // ---- CREATE NEW POST (unified) ----

        // 1) Share replay → create a liveStream post referencing the VOD/live session
        if (isReplay) {
          const originalType = post.type || post.postType;

          const payload = {
            type: 'sharedPost',
            originalType,
            originalPostId: post._id,
            userId: currentUserId,
            message: caption,
            // picked up by buildRefsSection('liveStream')
            liveStreamId: post._id,
            // optional niceties if present on your live object:
            title: post.title,
            status: post.status || 'ended',
            coverKey: post.coverKey,
            durationSec: post.durationSec,
            viewerPeak: post.viewerPeak,
            startedAt: post.startedAt || post.createdAt,
            endedAt: post.endedAt || new Date().toISOString(),
          };

          await dispatch(createPost(payload)).unwrap();

          // 2) Share promotions / events (from feed OR nearby suggestions)
        } else if (isEventOrPromotion) {
          const originalType = post.type || post.kind || 'promotion';

          const payload = {
            type: 'sharedPost',
            userId: currentUserId,
            message: caption,
            // Can be a Promotion._id or Event._id; backend hydrator
            // now knows how to load from Promotion/Event/Post.
            originalPostId: post._id,
            originalType,
            originalKind: post.kind || post.type || originalType,

            // let backend attach business/location to the shared wrapper
            placeId: post.placeId,
            businessName: post.businessName,
            location: post.location,

            // optional snapshot so preview is stable even if original changes
            snapshot: {
              _id: post._id,
              type: originalType,
              kind: post.kind || originalType,
              title: post.title,
              description: post.description,
              date: post.date,
              allDay: post.allDay,
              startTime: post.startTime,
              endTime: post.endTime,
              recurring: post.recurring,
              recurringDays: post.recurringDays,
              photos: post.photos || post.media || [],
              placeId: post.placeId,
              businessName: post.businessName,
              location: post.location,
            },
          };

          await dispatch(createPost(payload)).unwrap();

          // 3) Default: share any "normal" post
        } else {
          const payload = {
            type: 'sharedPost',
            userId: currentUserId,
            message: caption,
            originalPostId: post._id, // unified Post._id
          };

          await dispatch(createPost(payload)).unwrap();
        }
      }

      setComment('');
      await animateOut();
    } catch (err) {
      console.error('[SharePostModal] ERROR in handleSubmit:', err);
    }
  };

  return (
    <Modal visible={visible} transparent onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={animateOut}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -130 : 0}
          style={styles.overlay}
        >
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.modalContent, animatedStyle]}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View>
                  <Notch />
                  <View style={styles.inputWrapper}>
                    <View style={styles.textInputColumn}>
                      <View style={styles.userInfo}>
                        {profilePicUrl ? (
                          <Image
                            source={{ uri: profilePicUrl }}
                            style={styles.avatar}
                          />
                        ) : (
                          <View
                            style={[
                              styles.avatar,
                              { backgroundColor: '#e5e7eb' },
                            ]}
                          />
                        )}
                        <Text style={styles.nameText}>
                          {fullName || 'You'}
                        </Text>
                      </View>
                      <TextInput
                        value={comment}
                        onChangeText={setComment}
                        placeholder={
                          sharedPost?.type === 'invite'
                            ? 'Add a note to this invite...'
                            : 'Write a comment...'
                        }
                        style={styles.textInput}
                        multiline
                        underlineColorAndroid="transparent"
                      />
                      {!isReplay ? (
                        <PostPreviewCard post={sharedPost} />
                      ) : (
                        <View style={{ alignSelf: 'center' }}>
                          <VideoThumbnail
                            file={details}
                            width={200}
                            height={200}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={handleSubmit}
                    style={styles.shareButton}
                  >
                    <Text style={styles.shareButtonText}>
                      {isEditing ? 'Save Changes' : 'Share'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    marginBottom: 10,
  },
  shareButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  inputWrapper: {
    flexDirection: 'row',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    alignItems: 'flex-start',
    backgroundColor: '#fff',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    marginTop: 2,
  },
  textInputColumn: {
    flex: 1,
  },
  nameText: {
    fontWeight: '600',
    fontSize: 14,
    color: '#333',
  },
  textInput: {
    minHeight: 60,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#000',
    padding: 0,
    margin: 0,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
});
