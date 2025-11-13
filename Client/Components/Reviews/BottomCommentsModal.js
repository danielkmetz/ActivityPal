import React, { useEffect, useState, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    FlatList,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import useSlideDownDismiss from '../../utils/useSlideDown';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CommentThread from './CommentThread';
import { setReplyingTo } from '../../Slices/CommentThreadSlice';
import { toApiPostType, addComment as addCommentGeneric } from '../../Slices/CommentsSlice';
import { uploadReviewPhotos } from '../../Slices/PhotosSlice';
import { useDispatch } from 'react-redux';

const { height } = Dimensions.get('window');

const BottomCommentsModal = ({ visible, onClose, post }) => {
    const dispatch = useDispatch();
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
    const commentRefs = useRef({});
    const flatListRef = useRef(null);
    const [commentText, setCommentText] = useState('');
    const [selectedMedia, setSelectedMedia] = useState([]);

    useEffect(() => {
        if (visible) {
            animateIn();            // Animate it in
        } else {
            // Animate it out and hide the modal
            (async () => {
                await animateOut();
                onClose();
            })();
        }
    }, [visible]);

    const handleAddComment = async () => {
        const TAG = '[addCommentGeneric]';
        const t0 = Date.now();

        try {
            // --------- INPUT SUMMARY ---------
            const hasText = !!commentText?.trim();
            const hasMedia = (selectedMedia?.length || 0) > 0;

            const apiPostType = post?.type || post?.kind;
            // --------- GUARDS ---------
            if (!post) {
                console.warn(`${TAG} ABORT: post missing`);
                return;
            }
            if (!apiPostType) {
                console.warn(`${TAG} ABORT: toApiPostType returned falsy`, { sourceType: post?.type });
                return;
            }
            if (!hasText && !hasMedia) {
                console.warn(`${TAG} ABORT: neither text nor media present`);
                return;
            }

            // --------- MEDIA UPLOAD (optional) ---------
            let media = null;
            if (hasMedia) {
                const mediaFile = selectedMedia[0];
                const mStart = Date.now();

                let uploadAction;
                try {
                    uploadAction = await dispatch(
                        uploadReviewPhotos({
                            placeId: post.placeId, // ok if undefined for some post types
                            files: [mediaFile],
                        })
                    );

                    if (uploadReviewPhotos.fulfilled.match(uploadAction)) {
                        const result = uploadAction.payload;
                        if (Array.isArray(result) && result.length > 0) {
                            media = {
                                photoKey: result[0],
                                mediaType: mediaFile?.type?.startsWith('video') ? 'video' : 'image',
                            };
                        }
                    } else {
                        console.warn(`${TAG} media: upload rejected`, {
                            ms: Date.now() - mStart,
                            error: uploadAction.error,
                            payload: uploadAction.payload,
                        });
                    }
                } catch (e) {
                    console.error(`${TAG} media: upload threw`, {
                        ms: Date.now() - mStart,
                        message: e?.message,
                        stack: e?.stack,
                    });
                }
            }

            // --------- BUILD PAYLOAD ---------
            const payload = {
                postType: apiPostType,
                postId: post._id,
                commentText: (commentText || '').trim(),
                ...(media && { media }),
            };

            // --------- DISPATCH THUNK (NO unwrap) ---------
            const action = await dispatch(addCommentGeneric(payload));

            // Inspect result explicitly
            if (addCommentGeneric.fulfilled.match(action)) {
                // UI resets
                dispatch(setReplyingTo(null));
                setCommentText('');
                setSelectedMedia([]);

                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                }, 100);

                return; // success
            }

            // Rejected path
            console.error(`${TAG} rejected`, {
                ms: Date.now() - t0,
                error: action.error,
                payload: action.payload,
                meta: action.meta,
            });
            // bubble up so caller sees failure (matches previous behavior with unwrap)
            throw action.error || new Error('addCommentGeneric rejected');

        } catch (error) {
            console.error(`${TAG} THREW`, {
                ms: Date.now() - t0,
                message: error?.message,
                stack: error?.stack,
            });
        }
    };

    return (
        <Modal transparent visible={visible} animationType="slide">
            <TouchableWithoutFeedback onPress={animateOut}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={styles.overlay}
                    >
                        <GestureDetector gesture={gesture}>
                            <Animated.View style={[styles.container, animatedStyle]}>
                                <View style={styles.handleBar} />
                                <View style={styles.content}>
                                    <Text style={styles.title}>Comments</Text>
                                    <FlatList
                                        data={post?.comments || []}
                                        keyExtractor={(item) => item._id}
                                        renderItem={({ item }) => (
                                            <CommentThread
                                                item={item}
                                                review={post}
                                                styles={styles}
                                                commentRefs={commentRefs}
                                                commentText={commentText}
                                                setCommentText={setCommentText}
                                                setModalVisible={() => { }} // Optional, unless you support long-press actions here
                                            />
                                        )}
                                        contentContainerStyle={{ paddingBottom: 20 }}
                                        showsVerticalScrollIndicator={false}
                                    />

                                    {/* Input */}
                                    <View style={styles.inputRow}>
                                        <TextInput
                                            value={commentText}
                                            onChangeText={setCommentText}
                                            placeholder="Add a comment..."
                                            placeholderTextColor="#999"
                                            style={styles.input}
                                        />
                                        <TouchableOpacity style={styles.sendButton} onPress={handleAddComment}>
                                            <MaterialCommunityIcons name="send" size={22} color="white" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </Animated.View>
                        </GestureDetector>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
    container: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 10,
        paddingBottom: 30,
        paddingHorizontal: 20,
        maxHeight: height * 0.6,
    },
    handleBar: {
        width: 40,
        height: 5,
        backgroundColor: '#ccc',
        borderRadius: 10,
        alignSelf: 'center',
        marginBottom: 10,
    },
    content: {},
    title: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 12,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
        fontSize: 14,
    },
    sendButton: {
        marginLeft: 10,
        backgroundColor: '#009999',
        padding: 8,
        borderRadius: 20,
    },
});

export default BottomCommentsModal;
