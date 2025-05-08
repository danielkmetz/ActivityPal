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

const { height } = Dimensions.get('window');

const BottomCommentsModal = ({ visible, onClose, review }) => {
    const [comment, setComment] = useState('');
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
    const commentRefs = useRef({});
    const [commentText, setCommentText] = useState('');

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
                                        data={review?.comments || []}
                                        keyExtractor={(item) => item._id}
                                        renderItem={({ item }) => (
                                            <CommentThread
                                                item={item}
                                                review={review}
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
                                            value={comment}
                                            onChangeText={setComment}
                                            placeholder="Add a comment..."
                                            placeholderTextColor="#999"
                                            style={styles.input}
                                        />
                                        <TouchableOpacity style={styles.sendButton}>
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
