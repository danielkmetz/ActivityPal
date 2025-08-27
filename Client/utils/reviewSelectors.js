import { createSelector } from '@reduxjs/toolkit';
import {
  selectUserAndFriendsReviews,
  selectBusinessReviews,
  selectOtherUserReviews,
  selectSuggestedPosts,
} from '../Slices/ReviewsSlice';

export const selectReviewById = (reviewId) =>
  createSelector(
    [
      selectUserAndFriendsReviews,
      selectBusinessReviews,
      selectOtherUserReviews,
      selectSuggestedPosts,
    ],
    (userAndFriends, business, otherUser, suggested) =>
      business.find((r) => r._id === reviewId) ||
      userAndFriends.find((r) => r._id === reviewId) ||
      otherUser.find((r) => r._id === reviewId) ||
      suggested.find((r) => r._id === reviewId) ||
      null
  );
