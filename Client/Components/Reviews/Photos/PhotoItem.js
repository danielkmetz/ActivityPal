import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Image,
  Text,
  Animated,
  TouchableWithoutFeedback,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLikeAnimations } from '../../../utils/LikeHandlers/LikeAnimationContext';
import { handleLikeWithAnimation as likeWithAnim } from '../../../utils/LikeHandlers';
import { pickPostId } from '../../../utils/posts/postIdentity';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import TagUserModal from '../TagUserModal/TagUserModal';
import { medium } from '../../../utils/Haptics/haptics';

const screenWidth = Dimensions.get('window').width;
const DOUBLE_TAP_MS = 300;
const SINGLE_TAP_MS = 330;

/* ---------- Shared helpers (duplicated with video component) ---------- */

const postTypeFor = (item) => {
  const t = String(item?.type || '').toLowerCase();
  if (t) return t; // 'review','check-in','invite','sharedPost','liveStream','event','promotion'
  if (item?.kind || item?.__typename) return 'suggestion';
  return undefined;
};

const buildHandleLikeWithAnimation = ({ post, user, dispatch, getAnimation, lastTapRef }) => {
  return (force = false) => {
    likeWithAnim({
      postType: postTypeFor(post),
      postId: pickPostId(post),
      review: post, // still using "review" key for the helper
      user,
      dispatch,
      animation: getAnimation(post._id),
      lastTapRef,
      force,
    });
  };
};

const buildTapHandler = ({
  isInteractive,
  post,
  media,
  index,
  onOpenFullScreen,
  lastTapRef,
  timersRef,
  handleLikeWithAnimation,
}) => {
  return () => {
    if (!isInteractive) return;

    const id =
      post?._id ||
      post?.id ||
      post?.postId ||
      post?.eventId ||
      post?.promotionId;

    if (!id) {
      console.warn('[handleTap] No valid ID found for post', post);
      return;
    }

    const now = Date.now();
    const last = lastTapRef.current[id] || 0;

    // Double tap
    if (now - last < DOUBLE_TAP_MS) {
      if (timersRef.current[id]) {
        clearTimeout(timersRef.current[id]);
        timersRef.current[id] = null;
      }
      lastTapRef.current[id] = 0;
      handleLikeWithAnimation(true);
      return;
    }

    // Single tap arm
    lastTapRef.current[id] = now;

    timersRef.current[id] = setTimeout(() => {
      if (lastTapRef.current[id] === now) {
        onOpenFullScreen?.(media, index);
        lastTapRef.current[id] = 0;
      } else {
        console.log(
          `[handleTap -> timer] Ignored timer for id=${id}, lastTapRef changed`
        );
      }
      timersRef.current[id] = null;
    }, SINGLE_TAP_MS);
  };
};

/* ------------------ Image-only variant (NO player) ------------------ */

const PhotoItemImage = ({
  media,
  post,
  photoTapped,
  setPhotoTapped,
  index,
  isInteractive = true,
  onOpenFullScreen,
}) => {
  const dispatch = useDispatch();
  const { getAnimation, registerAnimation } = useLikeAnimations();
  const [animation, setAnimation] = useState(null);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const rawBannerUrl = post?.bannerUrl;
  const lastTapRef = useRef({});
  const timersRef = useRef({});
  const user = useSelector(selectUser);

  const taggedUsers = Array.isArray(media?.taggedUsers) ? media.taggedUsers : [];
  const shouldRenderTagButton =
    post?.type !== 'invite' && media?.taggedUsers?.length > 0;

  useEffect(() => {
    if (!post?._id) return;
    registerAnimation(post._id);
    const anim = getAnimation(post._id);
    if (anim) setAnimation(anim);
  }, [post?._id, getAnimation, registerAnimation]);

  const handleLikeWithAnimation = buildHandleLikeWithAnimation({
    post,
    user,
    dispatch,
    getAnimation,
    lastTapRef,
  });

  const handleTap = buildTapHandler({
    isInteractive,
    post,
    media,
    index,
    onOpenFullScreen,
    lastTapRef,
    timersRef,
    handleLikeWithAnimation,
  });

  const closeTagModal = () => {
    setTagModalVisible(false);
    setPhotoTapped?.(null);
  };

  const toggleTaggedUsers = (photoKey) => {
    setPhotoTapped(photoTapped === photoKey ? null : photoKey);
  };

  const openTagModal = () => {
    if (!media?.photoKey) return;
    medium();
    toggleTaggedUsers(media?.photoKey);
    setTagModalVisible(true);
  };

  return (
    <View
      style={styles.photoContainer}
      pointerEvents={isInteractive ? 'auto' : 'none'}
    >
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={styles.videoWrapper}>
          <Image
            source={{ uri: media.url || media.uri || media.bannerUrl || rawBannerUrl }}
            style={styles.photo}
          />
          {isInteractive && animation && (
            <Animated.View style={[styles.likeOverlay, { opacity: animation }]}>
              <MaterialCommunityIcons name="thumb-up" size={80} color="#80E6D2" />
            </Animated.View>
          )}
          {isInteractive &&
            photoTapped === media.photoKey &&
            media.taggedUsers?.map((taggedUser, idx) => (
              <View
                key={idx}
                style={[
                  styles.taggedLabel,
                  { top: taggedUser.y, left: taggedUser.x },
                ]}
              >
                <Text style={styles.tagText}>{taggedUser.fullName}</Text>
              </View>
            ))}
          {shouldRenderTagButton && (
            <TouchableWithoutFeedback onPress={openTagModal}>
              <View style={styles.tagIcon}>
                <MaterialCommunityIcons name="tag" size={24} color="white" />
              </View>
            </TouchableWithoutFeedback>
          )}
        </View>
      </TouchableWithoutFeedback>
      <TagUserModal
        visible={tagModalVisible}
        post={post}
        photoId={media?._id}
        onClose={closeTagModal}
        taggedUsers={taggedUsers}
        title="Tagged in this photo"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  photoContainer: {
    width: screenWidth,
    height: 400,
    marginBottom: 15,
  },
  photo: {
    width: screenWidth,
    height: 400,
  },
  taggedLabel: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  likeOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -40 }, { translateY: -40 }],
    opacity: 0,
  },
  videoWrapper: {
    width: screenWidth,
    alignSelf: 'center',
    backgroundColor: '#000',
  },
  tagIcon: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 6,
    borderRadius: 20,
    zIndex: 99,
  },
});

export default PhotoItemImage;
