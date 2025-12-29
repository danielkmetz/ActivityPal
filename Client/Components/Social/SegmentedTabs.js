import React from "react";
import { View } from "react-native";
import { styles } from "./socialStyles";
import { TABS } from "./socialConstants";
import TabPill from "./TabPill";

export default function SegmentedTabs({ activeTab, onChangeTab, requestsCount }) {
  return (
    <View style={styles.tabsWrap}>
      <TabPill
        label="People"
        active={activeTab === TABS.PEOPLE}
        onPress={() => onChangeTab(TABS.PEOPLE)}
      />
      <TabPill
        label="Plans"
        active={activeTab === TABS.PLANS}
        onPress={() => onChangeTab(TABS.PLANS)}
      />
      <TabPill
        label="Requests"
        active={activeTab === TABS.REQUESTS}
        badgeCount={requestsCount}
        onPress={() => onChangeTab(TABS.REQUESTS)}
      />
    </View>
  );
}
