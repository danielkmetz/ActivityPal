import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, TouchableWithoutFeedback, ScrollView, Image } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { selectUser } from '../../../Slices/UserSlice';
import CommentBubble from '../../Reviews/CommentBubble';
import CommentActions from '../../Reviews/CommentActions';
import CommentOptionsModal from '../../Reviews/CommentOptionsModal';
import Reply from '../../Reviews/Replies/Reply';
import { isVideo } from '../../../utils/isVideo';
import { uploadReviewPhotos } from '../../../Slices/PhotosSlice';
import { selectMediaFromGallery } from '../../../utils/selectPhotos';
import {
  selectEditedText,
  setNestedReplyInput,
  selectExpandedReplies,
  selectIsEditing,
  selectNestedExpandedReplies,
  selectNestedReplyInput,
  selectReplyingTo,
  selectSelectedComment,
  selectSelectedReply,
  setEditedText,
  setIsEditing,
  setNestedExpandedReplies,
  setReplyingTo,
  setSelectedComment,
  setSelectedReply,
  toggleReplyExpansion,
} from '../../../Slices/CommentThreadSlice';
import { addReply, toggleLike, editComment, deleteComment, toApiPostType } from '../../../Slices/CommentsSlice';

export default function EventPromoCommentThread({
  item,
  post,
  commentText,
  setCommentText,
  type, // 'event' | 'promotion'
  selectedMedia,
  setSelectedMedia,
}) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const userId = user?.id;
  const isEditing = useSelector(selectIsEditing);
  const selectedComment = useSelector(selectSelectedComment);
  const selectedReply = useSelector(selectSelectedReply);
  const replyingTo = useSelector(selectReplyingTo);
  const nestedExpandedReplies = useSelector(selectNestedExpandedReplies);
  const expandedReplies = useSelector(selectExpandedReplies);
  const nestedReplyInput = useSelector(selectNestedReplyInput);
  const editedText = useSelector(selectEditedText);
  const [isOptionsVisible, setOptionsVisible] = useState(false);
  const [selectedEditMedia, setSelectedEditMedia] = useState(null);
  const commentRef = useRef(null);
  const commentRefs = useRef({});
  const postType = type || post?.type || post?.kind;
  const apiPostType = toApiPostType(type || post?.type);

  const getTimeSincePosted = (dateString) => dayjs(dateString).fromNow(true);

  const handleSelectMedia = async () => {
    const files = await selectMediaFromGallery();
    if (files.length > 0) {
      setSelectedMedia([files[0]]);
      setSelectedEditMedia(files[0]);
    }
  };

  // ✅ Centralized add reply (uploads optional media first)
  const handleAddReply = async (commentId, text) => {
    let media = null;

    if (selectedMedia?.length > 0) {
      const mediaFile = selectedMedia[0];
      try {
        const result = await dispatch(
          uploadReviewPhotos({
            placeId: post.placeId,
            files: [mediaFile],
          })
        ).unwrap();

        if (result?.length > 0) {
          media = {
            photoKey: result[0],
            mediaType: mediaFile.type?.startsWith('video') ? 'video' : 'image',
          };
        }
      } catch (e) {
        // non-fatal; continue without media
      }
    }

    await dispatch(
      addReply({
        postType: apiPostType,
        postId: post._id,
        commentId,
        commentText: (text || '').trim(),
        ...(media && { media }),
      })
    );

    dispatch(toggleReplyExpansion(replyingTo));
    setSelectedMedia([]);
    setCommentText('');
    dispatch(setReplyingTo(null));
  };

  // ✅ Centralized like toggle (comment OR reply)
  const handleLike = (commentId) => {
    dispatch(
      toggleLike({
        postType: apiPostType,
        postId: post._id,
        commentId, // can be top-level or deep reply; listener figures out top-level
      })
    );
  };

  const handleEditComment = () => {
    const selected = selectedReply || selectedComment;
    if (!selected) return;

    dispatch(setIsEditing(true));
    dispatch(setEditedText(selected.commentText));

    const media = selected?.media;
    setSelectedEditMedia(media || null);
    setSelectedMedia(media ? [media] : []);
    setOptionsVisible(false);
  };

  // ✅ Centralized edit (uploads new media if needed)
  const handleSaveEdit = async () => {
    const selected = selectedReply || selectedComment;
    if (!selected) return;

    const originalMedia = selectedMedia;
    let newMedia = undefined; // undefined = "don’t touch media" (lets BE keep existing)

    if (!selectedEditMedia && (originalMedia?.length || 0) > 0) {
      // user removed media → set null to explicitly clear on BE
      newMedia = null;
    } else if (selectedEditMedia?.uri && !selectedEditMedia.photoKey) {
      try {
        const result = await dispatch(
          uploadReviewPhotos({
            placeId: post.placeId,
            files: [selectedEditMedia],
          })
        ).unwrap();

        if (result?.length > 0) {
          newMedia = {
            photoKey: result[0],
            mediaType: isVideo(selectedEditMedia) ? 'video' : 'image',
          };
        }
      } catch {
        // keep undefined to avoid BE media change on failure
      }
    } else if (selectedEditMedia?.photoKey) {
      newMedia = {
        photoKey: selectedEditMedia.photoKey,
        mediaType: selectedEditMedia.mediaType || 'image',
      };
    }

    await dispatch(
      editComment({
        postType: apiPostType,
        postId: post._id,
        commentId: selected._id,
        newText: editedText.trim(),
        ...(newMedia !== undefined && { media: newMedia }),
      })
    );

    setSelectedEditMedia(null);
    setSelectedMedia(null);
    dispatch(setIsEditing(false));
    dispatch(setEditedText(''));
    dispatch(setSelectedComment(null));
    dispatch(setSelectedReply(null));
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
      [replyId]: !nestedExpandedReplies[replyId],
    };
    dispatch(setNestedExpandedReplies(updated));
  };

  const handleLongPress = (commentOrReply, isReply = false, parentId = null) => {
    const authorId = commentOrReply?.userId;
    if (authorId !== userId) return;

    if (isReply) {
      dispatch(setSelectedReply({ ...commentOrReply, parentCommentId: parentId }));
      dispatch(setSelectedComment(null));
    } else {
      dispatch(setSelectedComment(commentOrReply));
      dispatch(setSelectedReply(null));
    }
    setOptionsVisible(true);
  };

  // ✅ Centralized delete
  const handleDeleteCommentOrReply = () => {
    const selectedItem = selectedReply || selectedComment;
    if (!selectedItem) return;

    dispatch(
      deleteComment({
        postType: apiPostType,
        postId: post._id,
        commentId: selectedItem._id,
      })
    );
    setOptionsVisible(false);
  };

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
            selectedMedia={selectedMedia}
            setSelectedMedia={setSelectedMedia}
            setSelectedEditMedia={setSelectedEditMedia}
            media={item?.media}
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
              <View style={styles.fakeInputBox}>
                {selectedMedia?.length > 0 && (
                  <ScrollView horizontal style={styles.previewContainer}>
                    {selectedMedia.map((file, idx) =>
                      isVideo(file) ? (
                        // If you use a VideoThumbnail component, keep it here
                        // <VideoThumbnail key={idx} file={file} width={70} height={70} shouldPlay={false} />
                        <View key={idx} style={[styles.previewImage, { alignItems: 'center', justifyContent: 'center' }]}>
                          <MaterialCommunityIcons name="video" size={24} />
                        </View>
                      ) : (
                        <Image key={idx} source={{ uri: file.uri }} style={styles.previewImage} />
                      )
                    )}
                  </ScrollView>
                )}
                <TextInput
                  style={styles.nestedReplyInput}
                  placeholder="Write a reply..."
                  value={commentText}
                  onChangeText={setCommentText}
                />
                {commentText.trim() === '' && (selectedMedia?.length || 0) === 0 && (
                  <TouchableOpacity onPress={handleSelectMedia} style={styles.cameraIcon}>
                    <MaterialCommunityIcons name="camera-outline" size={24} color="#555" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={styles.commentButton}
                onPress={() => handleAddReply(item?._id, commentText)}
              >
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
                  postType={apiPostType}
                  postId={post?._id}
                  review={post}
                  selectedMedia={selectedMedia}
                  setSelectedMedia={setSelectedMedia}
                  setSelectedEditMedia={setSelectedEditMedia}
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
  commentCard: {},
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
  replyButton: { marginLeft: 12 },
  replyText: { color: '#007aff', fontWeight: '500' },
  commentDate: { fontSize: 12, color: '#888' },
  inputContainer: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  sendButton: { backgroundColor: '#009999', padding: 10, borderRadius: 5, marginLeft: 8 },
  nestedReplyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
    marginHorizontal: 10,
  },
  commentButton: {
    backgroundColor: '#009999',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    marginLeft: 10,
  },
  commentButtonText: { color: '#fff', fontWeight: 'bold' },
  nestedReplyInput: { fontSize: 14 },
  expandRepliesButton: { flexDirection: 'row', alignItems: 'center', marginLeft: 10 },
  replyCountText: { fontSize: 14, color: '#888' },
  fakeInputBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 8,
    position: 'relative',
    backgroundColor: '#fff',
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 6,
    marginTop: 5,
  },
  cameraIcon: { position: 'absolute', right: 20, top: 5 },
});
