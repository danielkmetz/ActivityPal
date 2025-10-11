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
import { unfollowUser } from '../../../Slices/friendsSlice';
import { useDispatch, useSelector } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';

const toStr = (v) => (v == null ? '' : String(v));
const getTagId = (t) => toStr(t?.userId ?? t?._id ?? t?.id ?? t);

const NonOwnerOptions = ({
    item,
    visible,
    onClose,
    isFollowing = true,        // controls enabling of Unfollow row
    title = 'Post options',
}) => {
    const dispatch = useDispatch();
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
    const currentUser = useSelector(selectUser);
    const currentUserId = toStr(currentUser?.id);
    const postType = item?.type || item?.postType;
    const postId = item?._id || item?.id || item?.postId;
    const ownerName = item?.fullName;
    const ownerId = item?.userId;
    const status = useSelector((s) => selectSelfTagStatus(s, postType, postId));
    const isBusy = status === 'pending';

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

        const postLevelTags = Array.isArray(item?.taggedUsers) ? item.taggedUsers : [];
        const isTaggedAtPostLevel = postLevelTags.some((t) => getTagId(t) === currentUserId);

        const photos = Array.isArray(item?.photos) ? item.photos : [];
        const isTaggedInAnyPhoto = photos.some(
            (p) => Array.isArray(p?.taggedUsers) && p.taggedUsers.some((t) => getTagId(t) === currentUserId)
        );

        return isTaggedAtPostLevel || isTaggedInAnyPhoto;
    }, [item, currentUserId]);

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

    return (
        <Modal transparent visible={visible} onRequestClose={onClose}>
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
                                {/* Remove tag (post-wide) */}
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
                                    </>
                                )}
                                {/* Hide post (placeholder) */}
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    style={styles.row}
                                    onPress={() => { }}
                                    disabled={isBusy}
                                >
                                    <Text style={styles.actionText}>Hide this post</Text>
                                </TouchableOpacity>
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
    title: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 10,
        alignSelf: 'center',
    },
    row: {
        height: 56,
        alignItems: 'center',
        flexDirection: 'row',
    },
    rowDisabled: {
        opacity: 0.4,
    },
    actionText: {
        fontSize: 16,
        fontWeight: '600',
    },
    dangerText: {
        color: '#d32f2f',
    },
    sep: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#e6e6e6',
    },
});

export default NonOwnerOptions;
