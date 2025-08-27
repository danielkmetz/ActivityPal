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
import { createSharedPost, editSharedPost } from '../../../Slices/SharedPostsSlice';
import VideoThumbnail from '../VideoThumbnail';
import { postLiveSession, editLiveCaption } from '../../../Slices/LiveStreamSlice';

export default function SharePostModal({ visible, onClose, post, isEditing = false, setIsEditing }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const profilePic = useSelector(selectProfilePic);
  const profilePicUrl = profilePic?.url || null;
  const sharedPost = isEditing ? post?.original : post
  const isReplay = (post?.type === 'hls' || post?.type === 'liveStream') && (post?.vodUrl || post?.playbackUrl);

  const fullName = useMemo(() => {
    const first = user?.firstName ?? '';
    const last = user?.lastName ?? '';
    return [first, last].filter(Boolean).join(' ');
  }, [user?.firstName, user?.lastName]);

  const [comment, setComment] = useState('');
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

  useEffect(() => {
    if (visible) {
      animateIn();
    } else {
      (async () => {
        await animateOut();
        onClose?.();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resolveShareType = () => {
    const t = post?.type?.toLowerCase?.();
    if (!t) return null;

    if (t === 'hls') {
      return 'replay';
    }

    if (t === 'suggestion') {
      // Suggestion → promotion if kind mentions "promo", otherwise event
      const kindStr = post?.kind?.toLowerCase?.() || '';
      return kindStr.includes('promo') ? 'promotion' : 'event';
    }

    if (t === 'invite') {
      return 'invite';
    }

    return post.type; // review, event, promotion, etc.
  };

  const handleSubmit = async () => {
    if (!post?._id) {
      return;
    }
    const trimmed = (comment ?? '').trim();
    // For live caption endpoints, send null to CLEAR if user left it empty.
    const liveCaption = trimmed || null;

    try {
      if (isEditing) {
        // EDIT MODE
        if (post.type === 'liveStream') {
          // Edit caption on a posted live stream
          await dispatch(editLiveCaption({ liveId: post._id, caption: liveCaption }));
        } else if (post.type === 'sharedPost') {
          // Edit an existing shared post's caption
          await dispatch(editSharedPost({ sharedPostId: post._id, caption: trimmed }));
        } else {
          console.warn('[SharePostModal] Unsupported type in edit mode:', post.type);
          return;
        }
        setIsEditing(false);
      } else {
        // CREATE/POST MODE
        const postType = resolveShareType();
        if (!postType) {
          console.warn('[SharePostModal] Could not resolve post type.');
          return;
        }

        if (postType === 'replay') {
          // Post a live session replay with caption
          await dispatch(postLiveSession({ liveId: post._id, isPosted: true, caption: liveCaption }));
        } else {
          // Create a new shared post with caption
          await dispatch(
            createSharedPost({
              postType,
              originalPostId: post._id,
              caption: trimmed,
            })
          );
        }
      }

      setComment('');
      await animateOut();
    } catch (err) {
      console.error('[SharePostModal] ERROR in handleSubmit:', err);
    }
  };

  useEffect(() => {
    if (isEditing && post?.caption) {
      setComment(post.caption);
    }
  }, [isEditing, post]);

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
                          <Image source={{ uri: profilePicUrl }} style={styles.avatar} />
                        ) : (
                          <View style={[styles.avatar, { backgroundColor: '#e5e7eb' }]} />
                        )}
                        <Text style={styles.nameText}>{fullName || 'You'}</Text>
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
                          <VideoThumbnail file={post} width={200} height={200} />
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity onPress={handleSubmit} style={styles.shareButton}>
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
