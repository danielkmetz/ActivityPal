import { createSlice } from '@reduxjs/toolkit';

const paginationSlice = createSlice({
  name: 'pagination',
  initialState: {
    currentPage: 1,
    perPage: 10,
    categoryFilter: null,
    sortOptions: null,
    openNow: true,
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
    toggleOpenNow: (state) => {
      state.openNow = !state.openNow;
    },
    setSortOptions: (state, action) => {
      state.sortOptions = action.payload;
    },    
  },
});

export const { incrementPage, setSortOptions, toggleOpenNow, setCategoryFilter, resetPage, resetPagination } = paginationSlice.actions;
export const selectPagination = (state) => state.pagination;
export const selectCategoryFilter = (state) => state.pagination.categoryFilter;
export const selectIsOpen = (state) => state.pagination.openNow;
export const selectSortOptions = (state) => state.pagination.sortOptions;
export default paginationSlice.reducer;
