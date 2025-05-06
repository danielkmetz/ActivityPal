import React, { useEffect, useState } from 'react';
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
import CommentBubble from './CommentBubble';
import Reply from './Reply';

const { height } = Dimensions.get('window');

const BottomCommentsModal = ({ visible, onClose, review }) => {
    const [comment, setComment] = useState('');
    const [expandReplies, setExpandReplies] = useState(false);
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

    const getFlatListData = () => {
        if (!Array.isArray(review?.comments)) return [];
    
        const flatData = [];
    
        review.comments.forEach((comment) => {
          flatData.push({ ...comment, type: 'comment' });
    
          if (expandReplies && Array.isArray(comment.replies)) {
            comment.replies.forEach((reply) => {
              flatData.push({ ...reply, type: 'reply', parentId: comment._id });
            });
          }
        });
    
        return flatData;
    };

    const renderItem = ({ item }) => {
        if (item.type === 'comment') {
          return (
            <View style={{ marginBottom: 10 }}>
              <CommentBubble
                fullName={item.fullName}
                commentText={item.commentText}
                likes={item.likes}
                commentId={item._id}
                userId={item.userId}
                isReply={false}
              />
            </View>
          );
        }
    
        if (item.type === 'reply') {
          return (
            <View style={{ marginLeft: 40, marginBottom: 8 }}>
              <Reply
                reply={item}
                getTimeSincePosted={() => null}
              />
            </View>
          );
        } 
        return null;
    };

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
                                    {/* Example comment count */}
                                    <Text style={styles.subtitle}>{review?.comments?.length || 0} Comments</Text>

                                    <FlatList
                                        data={getFlatListData()}
                                        keyExtractor={(item) => item._id}
                                        renderItem={renderItem}
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
