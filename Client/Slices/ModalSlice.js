import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  contentModalOpen: false, // For review/check-in
  modalType: null,         // 'review' or 'checkin'
  inviteModalOpen: false,
  searchModalOpen: false,
  commentModalOpen: false,
  selectedReview: null,
  commentTargetId: null,
};

const modalSlice = createSlice({
  name: 'modals',
  initialState,
  reducers: {
    openContentModal: (state, action) => {
      state.contentModalOpen = true;
      state.modalType = action.payload; // 'review' or 'checkin'
    },
    closeContentModal: (state) => {
      state.contentModalOpen = false;
    },
    resetModalType: (state) => {
      state.modalType = null;
    },
    openInviteModal: (state) => {
      state.inviteModalOpen = true;
    },
    closeInviteModal: (state) => {
      state.inviteModalOpen = false;
    },
    openSearchModal: (state) => {
      state.searchModalOpen = true;
    },
    closeSearchModal: (state) => {
      state.searchModalOpen = false;
    },
    openCommentModal: (state, action) => {
      state.commentModalOpen = true;
      state.selectedReview = action.payload;
      state.commentTargetId = action.payload.targetId || null;
    },
    closeCommentModal: (state) => {
      state.commentModalOpen = false;
      state.selectedReview = null;
      state.commentTargetId = null;
    },
    setSelectedReview: (state, action) => {
        state.selectedReview = action.payload;
    },
    setTargetId: (state, action) => {
        state.commentTargetId = action.payload;
    },
    closeAllModals: (state) => {
      state.contentModalOpen = false;
      state.modalType = null;
      state.inviteModalOpen = false;
      state.searchModalOpen = false;
      state.commentModalOpen = false;
      state.selectedReview = null;
      state.commentTargetId = null;
    },
  },
});

export const {
  openContentModal,
  closeContentModal,
  openInviteModal,
  closeInviteModal,
  openSearchModal,
  closeSearchModal,
  closeAllModals,
  openCommentModal,
  closeCommentModal,
  setSelectedReview,
  setTargetId,
  resetModalType,
} = modalSlice.actions;

export const contentModalStatus = state => state.modals.contentModalOpen;
export const inviteModalStatus = state => state.modals.inviteModalOpen;
export const searchModalStatus = state => state.modals.searchModalOpen;
export const selectPostType = state => state.modals.modalType;
export const commentModalStatus = state => state.modals.commentModalOpen;
export const selectSelectedReview = state => state.modals.selectedReview;
export const selectCommentTargetId = state => state.modals.commentTargetId;

export default modalSlice.reducer;
