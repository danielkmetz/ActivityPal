import React, { useState, useEffect } from 'react';
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
import Notch from '../Notch/Notch';
import useSlideDownDismiss from '../../utils/useSlideDown';
import { GestureDetector } from 'react-native-gesture-handler';
import PostPreviewCard from './PostPreviewCard';
import { useSelector } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';
import { selectProfilePic } from '../../Slices/PhotosSlice';
import { createSharedPost } from '../../Slices/SharedPostsSlice';
import { useDispatch } from 'react-redux';

export default function SharePostModal({ visible, onClose, post }) {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const profilePic = useSelector(selectProfilePic);
    const profilePicUrl = profilePic?.url;
    const fullName = `${user?.firstName} ${user.lastName}`;
    const [comment, setComment] = useState('');
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

    useEffect(() => {
        if (visible) {
            animateIn();
        } else {
            (async () => {
                await animateOut();
                onClose();
            })();
        }
    }, [visible]);

    const handleSubmit = () => {
        if (!post?._id || !post?.type) {
            console.warn("Missing post ID or type for sharing");
            return;
        }

        dispatch(createSharedPost({
            postType: post.type,
            originalPostId: post._id,
            caption: comment.trim(),
        }));

        setComment('');
        onClose();
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
                                                <Image source={{ uri: profilePicUrl }} style={styles.avatar} />
                                                <Text style={styles.nameText}>{fullName}</Text>
                                            </View>
                                            <TextInput
                                                value={comment}
                                                onChangeText={setComment}
                                                placeholder="Write a comment..."
                                                style={styles.textInput}
                                                multiline
                                                underlineColorAndroid="transparent"
                                            />
                                            <PostPreviewCard post={post} />
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={handleSubmit} style={styles.shareButton}>
                                        <Text style={styles.shareButtonText}>Share</Text>
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
