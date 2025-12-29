import React, { useCallback } from "react";
import { View, TextInput, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import FindFriendsCard from "../Social/FindFriendsCard";
import SegmentedTabs from "../Social/SegmentedTabs";
import { TABS } from "../Social/socialConstants";
import { selectSocialTab, selectSocialQuery, setSocialTab, setSocialQuery } from "../../Slices/socialUiSlice";
import { selectFollowRequests } from "../../Slices/friendsSlice";

export default function SocialHeaderExtras() {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const activeTab = useSelector(selectSocialTab);
  const query = useSelector(selectSocialQuery);
  const followRequests = useSelector(selectFollowRequests) || { received: [], sent: [] };
  const requestsCount = (followRequests.received || []).length;

  const onChangeQuery = useCallback(
    (text) => dispatch(setSocialQuery(text)),
    [dispatch]
  );

  const onChangeTab = useCallback(
    (tab) => dispatch(setSocialTab(tab)),
    [dispatch]
  );

  const onPressFindFriends = useCallback(() => {
    navigation.navigate("FriendDiscovery");
  }, [navigation]);

  return (
    <View style={styles.wrap}>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search friends"
          placeholderTextColor="#999"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <FindFriendsCard onPress={onPressFindFriends} />
      <SegmentedTabs
        activeTab={activeTab || TABS.PEOPLE}
        onChangeTab={onChangeTab}
        requestsCount={requestsCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  searchWrap: { marginBottom: 10 },
  searchInput: {
    height: 42,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e6e6ef",
    color: "#111",
  },
});
