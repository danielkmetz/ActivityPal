import React, { useMemo, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, SectionList } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { selectFriends, selectFollowRequests } from "../Slices/friendsSlice";
import { TABS } from "../Components/Social/socialConstants";
import PersonRow from "../Components/Social/PersonRow";
import RequestRow from "../Components/Social/RequestRow";
import PlanRow from "../Components/Social/PlanRow";
import { selectSocialTab, selectSocialQuery } from "../Slices/socialUiSlice";
import { buildRequestsSections, buildPlansSections } from "../Components/Social/socialSections";

export default function SocialScreen() {
  const navigation = useNavigation();
  const friends = useSelector(selectFriends) || [];
  const followRequests = useSelector(selectFollowRequests) || { received: [], sent: [] };
  const activeTab = useSelector(selectSocialTab);
  const query = useSelector(selectSocialQuery);

  const onPressPerson = useCallback(
    (u) => {
      const id = u?._id || u?.id;
      if (!id) return;
      navigation.navigate("OtherUserProfile", { userId: id });
    },
    [navigation]
  );

  const filteredFriends = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return friends;

    return friends.filter((u) => {
      const first = (u?.firstName || "").toLowerCase();
      const last = (u?.lastName || "").toLowerCase();
      const full = `${first} ${last}`.trim();
      const username = (u?.username || "").toLowerCase();
      return first.includes(q) || last.includes(q) || full.includes(q) || username.includes(q);
    });
  }, [friends, query]);

  const requestSections = useMemo(
    () => buildRequestsSections({ followRequests, inviteRequests: [] }),
    [followRequests]
  );

  const planSections = useMemo(
    () => buildPlansSections({ invites: [] /* wire later */ }),
    []
  );

  return (
    <View style={screenStyles.container}>
      {activeTab === TABS.PEOPLE && (
        <FlatList
          data={filteredFriends}
          keyExtractor={(item, idx) => (item?._id ? String(item._id) : String(idx))}
          renderItem={({ item }) => <PersonRow user={item} onPress={() => onPressPerson(item)} />}
          contentContainerStyle={screenStyles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}
      {activeTab === TABS.REQUESTS && (
        <SectionList
          sections={requestSections}
          keyExtractor={(item, idx) => (item?._id ? String(item._id) : String(idx))}
          renderSectionHeader={({ section }) => (
            <Text style={screenStyles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item, section }) => <RequestRow item={item} kind={section.kind} />}
          contentContainerStyle={screenStyles.listContent}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
        />
      )}
      {activeTab === TABS.PLANS && (
        <SectionList
          sections={planSections}
          keyExtractor={(item, idx) => (item?._id ? String(item._id) : String(idx))}
          renderSectionHeader={({ section }) => (
            <Text style={screenStyles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => <PlanRow invite={item} onPress={() => {}} />}
          contentContainerStyle={screenStyles.listContent}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f7fb" },
  listContent: { paddingBottom: 24, paddingTop: 330 }, // small breathing room under header
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    fontSize: 14,
    fontWeight: "800",
    color: "#333",
  },
});
