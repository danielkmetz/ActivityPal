import React, { useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import Notch from '../../Notch/Notch';
import useSlideDownDismiss from '../../../utils/useSlideDown';
import { removeSelfFromPost, selectSelfTagStatus } from '../../../Slices/RemoveTagsSlice';
import { selectFollowing, unfollowUser } from '../../../Slices/friendsSlice';
import { useDispatch, useSelector } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import { useHiddenTagged } from '../../../Providers/HiddenTaggedContext'; // profile-level hide (tagged)
import { restoreUnhiddenTaggedToFeed, filterTaggedPost } from '../../../Slices/TaggedPostsSlice';
import { useHiddenPosts } from '../../../Providers/HiddenPostsContext'; // adjust path if needed
import { normalizePostType as normalizeHideType } from '../../../utils/normalizePostType';
import { addPostBackToProfileByCreatedAt, addPostBackToUserAndFriendsByCreatedAt } from '../../../Slices/PostsSlice';

const toStr = (v) => (v == null ? '' : String(v));
const getTagId = (t) => toStr(t?.userId ?? t?._id ?? t?.id ?? t);

const NonOwnerOptions = ({ post, visible, onClose, title = 'Post options' }) => {
  const dispatch = useDispatch();
  const postContent = post?.original ?? post ?? {};
  const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
  const currentUser = useSelector(selectUser);
  const following = useSelector(selectFollowing);
  const currentUserId = toStr(currentUser?.id);
  const rawType = postContent?.type || postContent?.postType || postContent?.__typename;
  const postType = normalizeHideType(rawType);
  const postId = postContent?._id || postContent?.id || postContent?.postId;
  const ownerName = postContent?.owner?.fullName || `${postContent?.user?.firstName} ${postContent?.user?.lastName}` || `${postContent?.owner?.firstName} ${postContent?.owner?.lastName}`;
  const ownerId = postContent?.owner?.id || postContent?.user?.id;
  const status = useSelector((s) => selectSelfTagStatus(s, postType, postId));
  const isPostOwner = ownerId === currentUserId;
  const isBusy = status === 'pending';
  const followingIds = following.map(u => u._id);
  const isFollowing = followingIds.includes(ownerId);

  // Profile-level (tagged) hide helpers
  const { isHidden: isHiddenOnProfile, hide: hideFromProfile, unhide: unhideFromProfile } = useHiddenTagged();
  const hiddenOnProfile = isHiddenOnProfile(postType, postId);

  // NEW: Global (everywhere) hide helpers
  const { isHidden: isHiddenGlobally, hide: hideEverywhere, unhide: unhideEverywhere, enabled: canGlobalHide } = useHiddenPosts();
  const hiddenGlobally = isHiddenGlobally(postType, postId);

  const getInnerPost = (w) => w?.post || w?.review || w?.checkIn || w?.sharedPost || w;

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

  const handleOverlayPress = useCallback(async () => {
    await animateOut();
  }, []);

  const closeAfter = async (fn) => {
    try {
      await fn?.();
    } finally {
      await animateOut();
    }
  };

  const canRemoveTag = useMemo(() => {
    if (!currentUserId) return false;
    const postLevelTags = Array.isArray(postContent?.taggedUsers) ? postContent.taggedUsers : [];
    const isTaggedAtPostLevel = postLevelTags.some((t) => getTagId(t) === currentUserId);
    const photos = Array.isArray(postContent?.photos) ? postContent.photos : [];
    const isTaggedInAnyPhoto = photos.some(
      (p) => Array.isArray(p?.taggedUsers) && p.taggedUsers.some((t) => getTagId(t) === currentUserId)
    );
    return isTaggedAtPostLevel || isTaggedInAnyPhoto;
  }, [postContent, currentUserId]);

  // Remove tag
  const handleRemoveFromPost = async () => {
    if (isBusy) return;
    Alert.alert(
      'Remove tag?',
      'Are you sure you want to remove your tag from this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            closeAfter(async () => {
              try {
                await dispatch(removeSelfFromPost({ postType, postId })).unwrap();
              } catch (e) {
                console.warn('Failed to remove tag from post', e);
              }
            }),
        },
      ],
      { cancelable: true }
    );
  };

  // Unfollow
  const handleUnfollowUser = () => {
    if (!isFollowing || !ownerId || isBusy) return;
    Alert.alert(
      'Unfollow user?',
      `Are you sure you want to unfollow${ownerName ? ` ${ownerName}` : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: () => closeAfter(() => dispatch(unfollowUser(ownerId))),
        },
      ],
      { cancelable: true }
    );
  };

  // Profile-only hide/unhide (tagged)
  const handleHideFromProfile = async () => {
    if (isBusy) return;
    Alert.alert(
      'Hide post from profile?',
      'This will remove the tagged post from your profile. You can unhide it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: () =>
            closeAfter(async () => {
              try {
                await hideFromProfile(postType, postId);
                Alert.alert('Hidden from profile', 'This post will no longer appear on your profile.');
              } catch (e) {
                console.warn('Failed to hide post from profile', e);
              }
            }),
        },
      ],
      { cancelable: true }
    );
  };

  const handleUnhideFromProfile = async () => {
    if (isBusy) return;
    closeAfter(async () => {
      try {
        await unhideFromProfile(postType, postId);
        await dispatch(restoreUnhiddenTaggedToFeed({ postType, postId, forUserId: currentUserId }));
        Alert.alert('Post unhidden', 'This post will appear on your profile again.');
      } catch (e) {
        console.warn('Failed to unhide post from profile', e);
      }
    });
  };

  // NEW: Global hide/unhide (everywhere)
  const handleHideEverywhere = async () => {
    if (!canGlobalHide || isBusy) return;
    Alert.alert(
      'Hide this post?',
      'You will no longer see this post anywhere in ActivityPal.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: () =>
            closeAfter(async () => {
              try {
                await hideEverywhere(postType, postId);
                
                if (canRemoveTag) {
                  dispatch(filterTaggedPost({ postType, postId, forUserId: currentUserId }));
                }
                // Optional: toast/snackbar here
              } catch (e) {
                console.warn('Failed to hide post globally', e);
              }
            }),
        },
      ],
      { cancelable: true }
    );
  };

  const handleUnhideEverywhere = async () => {
    if (!canGlobalHide || isBusy) return;

    closeAfter(async () => {
      try {
        await unhideEverywhere(postType, postId);

        const inner = getInnerPost(postContent) || postContent;

        // Always re-add to U&F
        dispatch(addPostBackToUserAndFriendsByCreatedAt(inner));

        // If tagged, restore in the TAGGED feed
        if (canRemoveTag) {
          dispatch(restoreUnhiddenTaggedToFeed({ item: inner, forUserId: currentUserId }));
        }

        // If owner, restore in PROFILE feed (do this regardless of tagged status)
        if (isPostOwner) {
          dispatch(addPostBackToProfileByCreatedAt(inner));
        }
      } catch (e) {
        console.warn('Failed to unhide post globally', e);
      }
    });
  };

  return (
    <Modal transparent visible={visible} onRequestClose={animateOut}>
      <TouchableWithoutFeedback onPress={handleOverlayPress}>
        <Animated.View style={styles.modalOverlay}>
          <GestureDetector gesture={gesture}>
            <TouchableWithoutFeedback>
              <Animated.View style={[styles.modalContent, animatedStyle]}>
                <Notch />
                <Text style={styles.title}>{title}</Text>
                {/* Unfollow */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.row, !isFollowing && styles.rowDisabled]}
                  onPress={handleUnfollowUser}
                  disabled={!isFollowing || isBusy}
                >
                  <Text style={[styles.actionText, styles.dangerText]}>
                    {isFollowing ? `Unfollow${ownerName ? ` ${ownerName}` : ''}` : 'Unfollow (not following)'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.sep} />
                {/* Remove tag + Hide/Unhide from profile (only if user is tagged) */}
                {canRemoveTag && (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={[styles.row, isBusy && { opacity: 0.6 }]}
                      onPress={handleRemoveFromPost}
                      disabled={isBusy}
                    >
                      <Text style={[styles.actionText, styles.dangerText]}>Remove tag from this post</Text>
                    </TouchableOpacity>
                    <View style={styles.sep} />
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={[styles.row, isBusy && { opacity: 0.6 }]}
                      onPress={hiddenOnProfile ? handleUnhideFromProfile : handleHideFromProfile}
                      disabled={isBusy}
                    >
                      <Text style={styles.actionText}>
                        {hiddenOnProfile ? 'Unhide post on profile' : 'Hide post from profile'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.sep} />
                  </>
                )}
                {/* Global Hide / Unhide */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.row, (!canGlobalHide || isBusy) && styles.rowDisabled]}
                  onPress={hiddenGlobally ? handleUnhideEverywhere : handleHideEverywhere}
                  disabled={!canGlobalHide || isBusy}
                >
                  <Text style={styles.actionText}>
                    {hiddenGlobally ? 'Unhide this post (everywhere)' : 'Hide this post'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.sep} />
              </Animated.View>
            </TouchableWithoutFeedback>
          </GestureDetector>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    minHeight: 220,
    paddingBottom: 28,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 10, alignSelf: 'center' },
  row: { height: 56, alignItems: 'center', flexDirection: 'row' },
  rowDisabled: { opacity: 0.4 },
  actionText: { fontSize: 16, fontWeight: '600' },
  dangerText: { color: '#d32f2f' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#e6e6e6' },
});

export default NonOwnerOptions;
