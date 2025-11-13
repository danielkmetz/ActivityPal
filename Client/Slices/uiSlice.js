import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: { headerTitle: null },
  reducers: {
    setHeaderTitle: (s, a) => { s.headerTitle = a.payload || null; },
    clearHeaderTitle: (s) => { s.headerTitle = null; },
  }
});

export const { setHeaderTitle, clearHeaderTitle } = uiSlice.actions;
export const selectHeaderTitle = (state) => state.ui.headerTitle;
export default uiSlice.reducer;
