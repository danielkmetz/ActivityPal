import { createSlice } from "@reduxjs/toolkit";
import { TABS } from "../Components/Social/socialConstants";

const initialState = {
  activeTab: TABS.PEOPLE,
  query: "",
};

const socialUiSlice = createSlice({
  name: "socialUi",
  initialState,
  reducers: {
    setSocialTab(state, action) {
      state.activeTab = action.payload || TABS.PEOPLE;
    },
    setSocialQuery(state, action) {
      state.query = typeof action.payload === "string" ? action.payload : "";
    },
    resetSocialUi(state) {
      state.activeTab = TABS.PEOPLE;
      state.query = "";
    },
  },
});

export const { setSocialTab, setSocialQuery, resetSocialUi } = socialUiSlice.actions;

export const selectSocialTab = (state) => state.socialUi?.activeTab || TABS.PEOPLE;
export const selectSocialQuery = (state) => state.socialUi?.query || "";

export default socialUiSlice.reducer;
