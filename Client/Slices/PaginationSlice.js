// slices/paginationSlice.js
import { createSlice } from '@reduxjs/toolkit';

const paginationSlice = createSlice({
  name: 'pagination',
  initialState: {
    currentPage: 1,
    perPage: 10,
    categoryFilter: null,
  },
  reducers: {
    incrementPage: (state) => {
      state.currentPage += 1;
    },
    resetPage: (state) => {
      state.currentPage = 1;
    },
    setCategoryFilter: (state, action) => {
      state.categoryFilter = action.payload;
      state.currentPage = 1; // optionally reset page on new filter
    },
    resetPagination: (state) => {
      state.currentPage = 1;
      state.categoryFilter = null;
    },    
  },
});

export const { incrementPage, resetPage, setCategoryFilter, resetPagination } = paginationSlice.actions;
export const selectPagination = (state) => state.pagination;
export default paginationSlice.reducer;
