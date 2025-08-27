import { createAsyncThunk } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { addReply, addComment, editCommentOrReply, deleteCommentOrReply } from './ReviewsSlice';
import { createNotification } from './NotificationsSlice';

export const addNewReply = createAsyncThunk(
  'commentThread/addNewReply',
  async ({ review, replyingTo, commentText, userId, fullName, media }, { dispatch }) => {
    const { type: postType, placeId, _id: postId } = review;
    
    const { payload } = await dispatch(
      addReply({
        postType,
        placeId,
        postId,
        commentId: replyingTo,
        userId,
        fullName,
        commentText,
        media,
      })
    );

    if (!payload?.replyId) return;

    dispatch(toggleReplyExpansion(replyingTo));
    dispatch(setReplyingTo(null));
    dispatch(setEditedText(''));

    if (payload.userId && payload.userId !== userId) {
      await dispatch(
        createNotification({
          userId: payload.userId,
          type: 'reply',
          message: `${fullName} replied to your ${postType}.`,
          relatedId: userId,
          typeRef: 'User',
          targetId: postId,
          commentId: replyingTo,
          replyId: payload.replyId,
          commentText,
          postType,
        })
      );
    }
  }
);

export const addNewNestedReply = createAsyncThunk(
  'commentThread/addNewNestedReply',
  async ({ review, parentCommentId, replyText, userId, fullName, media }, { dispatch }) => {
    const response = await dispatch(
      addReply({
        postType: review.type,
        placeId: review.placeId,
        postId: review._id,
        commentId: parentCommentId,
        userId,
        fullName,
        commentText: replyText,
        media,
      })
    );

    const payload = response.payload;
    if (!payload?.replyId || payload.userId === userId) return;

    await dispatch(createNotification({
      userId: payload.userId,
      type: 'reply',
      message: `${fullName} replied to your ${review.type}.`,
      relatedId: userId,
      typeRef: 'User',
      targetId: review._id,
      commentId: parentCommentId,
      replyId: payload.replyId,
      commentText: replyText,
      postType: review.type,
    }));

    return payload;
  }
);

export const addNewComment = createAsyncThunk(
  'commentThread/addNewComment',
  async ({ review, userId, fullName, commentText, media }, { dispatch }) => {
    const postType = review.type;
    const placeId = review.placeId;
    const postId = review._id;

    const response = await dispatch(
      addComment({ postType, placeId, postId, userId, fullName, commentText, media })
    );

    const payload = response.payload;
    if (!payload?.commentId) return null;

    if (review.userId !== userId) {
      await dispatch(createNotification({
        userId: review.userId,
        type: 'comment',
        message: `${fullName} commented on your ${postType}.`,
        relatedId: userId,
        typeRef: 'User',
        targetId: postId,
        commentId: payload.commentId,
        commentText,
        postType
      }));
    }

    return payload;
  }
);

export const saveEditedCommentOrReply = createAsyncThunk(
  'commentThread/saveEditedCommentOrReply',
  async ({ review, selected, editedText, userId, media }, { dispatch }) => {
    const postType = review.type;
    const postId = review._id;
    const placeId = review.placeId;
    const commentId = selected._id;

    await dispatch(editCommentOrReply({
      postType,
      placeId,
      postId,
      commentId,
      userId,
      newText: editedText,
      ...(media !== undefined && { media }), // can be object or null
    }));

    dispatch(setIsEditing(false));
    dispatch(setSelectedComment(null));
    dispatch(setSelectedReply(null));
    dispatch(setEditedText(''));
  }
);

export const removeCommentOrReply = createAsyncThunk(
  'commentThread/removeCommentOrReply',
  async ({ review, selectedComment, selectedReply }, { dispatch }) => {
    let commentId, relatedId;

    if (selectedComment) {
      commentId = selectedComment._id;
      relatedId = review.userId;
    } else if (selectedReply) {
      commentId = selectedReply._id;
      relatedId = selectedReply.parentCommentUserId || review.userId;
    } else {
      return;
    }

    await dispatch(deleteCommentOrReply({
      postType: review.type,
      placeId: review.placeId,
      postId: review._id,
      commentId,
      relatedId,
    }));

    dispatch(setSelectedComment(null));
    dispatch(setSelectedReply(null));
  }
);

const initialState = {
  replyingTo: null,
  expandedReplies: {},
  selectedComment: null,
  selectedReply: null,
  isEditing: false,
  editedText: '',
  nestedReplyInput: false,
  nestedExpandedReplies: {},
};

const commentThreadSlice = createSlice({
  name: 'commentThread',
  initialState,
  reducers: {
    setReplyingTo: (state, action) => { state.replyingTo = action.payload; },
    toggleReplyExpansion: (state, action) => {
      const id = action.payload;
      state.expandedReplies[id] = !state.expandedReplies[id];
    },
    setSelectedComment: (state, action) => { state.selectedComment = action.payload; },
    setSelectedReply: (state, action) => { state.selectedReply = action.payload; },
    setIsEditing: (state, action) => { state.isEditing = action.payload; },
    setEditedText: (state, action) => { state.editedText = action.payload; },
    setNestedReplyInput: (state, action) => { state.nestedReplyInput = action.payload; },
    setNestedExpandedReplies: (state, action) => { state.nestedExpandedReplies = action.payload; },
    resetCommentState: () => initialState,
  },
});

export const {
  setReplyingTo,
  toggleReplyExpansion,
  setSelectedComment,
  setSelectedReply,
  setIsEditing,
  setEditedText,
  setNestedReplyInput,
  setNestedExpandedReplies,
  resetCommentState,
} = commentThreadSlice.actions;

export const selectReplyingTo = (state) => state.commentThread.replyingTo;
export const selectExpandedReplies = (state) => state.commentThread.expandedReplies;
export const selectSelectedComment = (state) => state.commentThread.selectedComment;
export const selectSelectedReply = (state) => state.commentThread.selectedReply;
export const selectIsEditing = (state) => state.commentThread.isEditing;
export const selectEditedText = (state) => state.commentThread.editedText;
export const selectNestedReplyInput = (state) => state.commentThread.nestedReplyInput;
export const selectNestedExpandedReplies = (state) => state.commentThread.nestedExpandedReplies;

export default commentThreadSlice.reducer;
