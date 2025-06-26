import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { selectUser } from '../../../Slices/UserSlice';
import dayjs from 'dayjs';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import CommentBubble from '../../Reviews/CommentBubble';
import CommentActions from '../../Reviews/CommentActions';
import CommentOptionsModal from '../../Reviews/CommentOptionsModal';
import Reply from '../../Reviews/Reply';
import {
    leaveEventComment,
    leaveEventReply,
    toggleEventCommentLike,
    editEventCommentOrReply,
    deleteEventCommentOrReply,
} from '../../../Slices/EventsSlice'; // Or PromotionsSlice, depending on type
import {
    leavePromoComment,
    leavePromoReply,
    likePromoCommentOrReply,
    editPromoCommentOrReply,
    deletePromoCommentOrReply,
} from '../../../Slices/PromotionsSlice';
import { selectEditedText, setNestedReplyInput, selectExpandedReplies, selectIsEditing, selectNestedExpandedReplies, selectNestedReplyInput, selectReplyingTo, selectSelectedComment, selectSelectedReply, setEditedText, setIsEditing, setNestedExpandedReplies, setReplyingTo, setSelectedComment, setSelectedReply, toggleReplyExpansion } from '../../../Slices/CommentThreadSlice';

export default function EventPromoCommentThread({ item, post, commentText, setCommentText, type }) {
    const dispatch = useDispatch();
    const user = useSelector(selectUser);
    const isEditing = useSelector(selectIsEditing);
    const selectedComment = useSelector(selectSelectedComment);
    const selectedReply = useSelector(selectSelectedReply);
    const replyingTo = useSelector(selectReplyingTo);
    const nestedExpandedReplies = useSelector(selectNestedExpandedReplies);
    const [isOptionsVisible, setOptionsVisible] = useState(false);
    const editedText = useSelector(selectEditedText);
    const expandedReplies = useSelector(selectExpandedReplies);
    const nestedReplyInput = useSelector(selectNestedReplyInput);
    const userId = user?.id;
    const fullName = `${user?.firstName} ${user?.lastName}`;
    const commentRef = useRef(null);
    const commentRefs = useRef({});
    const isEvent = type === 'event';
    
    const getTimeSincePosted = (dateString) => dayjs(dateString).fromNow(true);

    const handleAddReply = (commentId, text) => {
        if (!text.trim()) return;

        const replyThunk = isEvent ? leaveEventReply : leavePromoReply;

        dispatch(replyThunk({
            placeId: post.placeId,
            id: post._id,
            commentId,
            userId,
            fullName,
            commentText: text,
        }));

        dispatch(toggleReplyExpansion(replyingTo));

        setCommentText('');
        dispatch(setReplyingTo(null));
    };

    const handleLike = (commentId) => {
        const likeThunk = isEvent ? toggleEventCommentLike : likePromoCommentOrReply;

        dispatch(likeThunk({
            placeId: post.placeId,
            id: post._id,
            commentId,
            userId,
            fullName
        }));
    };

    const handleEditComment = () => {
        if (!selectedComment && !selectedReply) return;

        dispatch(setIsEditing(true));
        dispatch(setEditedText(selectedReply ? selectedReply.commentText : selectedComment.commentText))
        setOptionsVisible(false);
    };

    const handleSaveEdit = () => {
        const selected = selectedReply || selectedComment;
        if (!selected) return;

        const editThunk = isEvent ? editEventCommentOrReply : editPromoCommentOrReply;

        dispatch(editThunk({
            id: post._id,
            commentId: selected._id,
            commentText,
        }))
    };

    const handleCancelEdit = () => {
        dispatch(setIsEditing(false));
        dispatch(setEditedText(''));
    };

    const handleReplyToggle = () => {
        dispatch(setReplyingTo(replyingTo === item._id ? null : item._id));
        setCommentText('');
    };

    const handleExpandReplies = (replyId) => {
        const updated = {
            ...nestedExpandedReplies,
            [replyId]: !nestedExpandedReplies[replyId], // toggle instead of force-true
        };
        dispatch(setNestedExpandedReplies(updated));
    };

    const handleLongPress = (commentOrReply, isReply = false, parentId = null) => {
        const authorId = commentOrReply?.userId;

        if (authorId !== userId) return;

        if (isReply) {
            dispatch(setSelectedReply({ ...commentOrReply, parentCommentId: parentId }))
            dispatch(setSelectedComment(null));
        } else {
            dispatch(setSelectedComment(commentOrReply));
            dispatch(setSelectedReply(null));
        }

        setOptionsVisible(true);
    };

    const handleDeleteCommentOrReply = () => {
        const deleteThunk = isEvent ? deleteEventCommentOrReply : deletePromoCommentOrReply;
        const selectedItem = selectedReply ? selectedReply : selectedComment;

        dispatch(deleteThunk({
            id: post._id,
            commentId: selectedItem._id,
        }));
        setOptionsVisible(false);
    }

    return (
        <>
            <TouchableWithoutFeedback onLongPress={() => handleLongPress(item)}>
                <View style={styles.commentCard} ref={commentRef}>
                    <CommentBubble
                        fullName={item.fullName}
                        commentText={item.commentText}
                        commentId={item?._id}
                        likes={item.likes}
                        userId={userId}
                        isReply={false}
                        isEditing={isEditing}
                        isSelected={selectedComment?._id === item?._id}
                        onToggleLike={() => handleLike(item?._id)}
                        setEditedText={(text) => dispatch(setEditedText(text))}
                        editedText={editedText}
                    />
                    <View style={styles.replyContainer}>
                        <Text style={styles.commentDate}>{getTimeSincePosted(item.date)}</Text>
                        <CommentActions
                            isEditing={isEditing}
                            isSelected={selectedComment?._id === item?._id}
                            onSaveEdit={handleSaveEdit}
                            onCancelEdit={handleCancelEdit}
                            onReply={handleReplyToggle}
                            isReplying={replyingTo === item?._id}
                        />
                        {item.replies?.length > 0 && (
                            <TouchableOpacity
                                onPress={() => dispatch(toggleReplyExpansion(item?._id))}
                                style={styles.expandRepliesButton}
                            >
                                <MaterialCommunityIcons
                                    name={expandedReplies[item._id] ? 'chevron-up' : 'chevron-down'}
                                    size={20}
                                    color="#808080"
                                />
                                <Text style={styles.replyCountText}>
                                    {item.replies.length} {item.replies.length > 1 ? 'replies' : 'reply'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {replyingTo === item._id && (
                        <View style={styles.nestedReplyInputContainer}>
                            <TextInput
                                style={styles.nestedReplyInput}
                                placeholder="Write a reply..."
                                value={commentText}
                                onChangeText={setCommentText}
                            />
                            <TouchableOpacity style={styles.commentButton} onPress={() => handleAddReply(item._id, commentText)}>
                                <Text style={styles.commentButtonText}>Reply</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {expandedReplies[item._id] && item.replies?.length > 0 && (
                        <View style={styles.repliesContainer}>
                            {item.replies.map((reply) => (
                                <Reply
                                    key={reply._id}
                                    reply={reply}
                                    onAddReply={handleAddReply}
                                    getTimeSincePosted={getTimeSincePosted}
                                    nestedExpandedReplies={nestedExpandedReplies}
                                    setNestedExpandedReplies={(payload) => dispatch(setNestedExpandedReplies(payload))}
                                    commentRefs={commentRefs}
                                    handleExpandReplies={handleExpandReplies}
                                    handleLongPress={handleLongPress}
                                    parentCommentId={item._id}
                                    nestedReplyInput={nestedReplyInput}
                                    setNestedReplyInput={(val) => dispatch(setNestedReplyInput(val))}
                                    handleEditComment={() => dispatch(setIsEditing(true))}
                                    handleSaveEdit={handleSaveEdit}
                                    setIsEditing={(val) => dispatch(setIsEditing(val))}
                                    setEditedText={(val) => dispatch(setEditedText(val))}
                                    isEditing={isEditing}
                                    editedText={editedText}
                                    selectedReply={selectedReply}
                                    postType={post?.type}
                                    placeId={post?.placeId}
                                    postId={post?._id}
                                    review={post}
                                    likePromoEventComment={handleLike}
                                    isPromoOrEvent={true}
                                />
                            ))}
                        </View>
                    )}
                </View>
            </TouchableWithoutFeedback>
            <CommentOptionsModal
                isVisible={isOptionsVisible}
                onClose={() => setOptionsVisible(false)}
                onEdit={handleEditComment}
                onDelete={handleDeleteCommentOrReply}
            />
        </>
    );
}

const styles = StyleSheet.create({
    commentCard: {
        //marginBottom: 12,
        //paddingHorizontal: 16,
    },
    replyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        marginLeft: 12,
    },
    repliesContainer: {
        marginTop: 6,
        paddingLeft: 16,
    },
    replyButton: {
        marginLeft: 12,
    },
    replyText: {
        color: '#007aff',
        fontWeight: '500',
    },
    commentDate: {
        fontSize: 12,
        color: '#888',
    },
    inputContainer: {
        flexDirection: 'row',
        marginTop: 10,
        alignItems: 'center',
    },
    input: {
        flex: 1,
        height: 40,
        borderWidth: 1,
        borderColor: '#ccc',
        paddingHorizontal: 10,
        borderRadius: 5,
    },
    sendButton: {
        backgroundColor: '#009999',
        padding: 10,
        borderRadius: 5,
        marginLeft: 8,
    },
    nestedReplyInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
    },
    commentButton: {
        backgroundColor: '#009999',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 5,
        marginLeft: 10,
    },
    commentDate: {
        fontSize: 12,
        color: '#777',
        marginRight: 10,
        marginLeft: 20,
    },
    commentButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    nestedReplyInput: {
        flex: 1,
        height: 40,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 5,
        paddingHorizontal: 10,
        marginRight: 10,
    },
    replyContainer: {
        flexDirection: 'row',
        marginLeft: 10,
    },
    expandRepliesButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 10,
    },
    replyCountText: {
        fontSize: 14,
        color: '#888',
    },
});
