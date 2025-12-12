import React, { useCallback, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import SelfProfileHeader from "./SelfProfileHeader";
import ProfileTabs from "./ProfileTabs";
import { selectUser } from "../../Slices/UserSlice";
import { selectProfilePic, selectBanner } from "../../Slices/PhotosSlice";
import { selectFollowing, selectFollowers } from "../../Slices/friendsSlice";
import { clearTodayEngagementLog } from "../../Slices/EngagementSlice";

function ProfileChrome({
  activeSection,
  setActiveSection,
  setEditModalVisible,
  setConnectionsModalVisible,
  setActiveConnectionsTab,
  dividerStyle = null,
}) {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const user = useSelector(selectUser, shallowEqual);
  const profilePic = useSelector(selectProfilePic);
  const banner = useSelector(selectBanner);
  const followingCount = useSelector((s) => (selectFollowing(s) || []).length);
  const followersCount = useSelector((s) => (selectFollowers(s) || []).length);

  const fullName = useMemo(() => {
    return `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  }, [user?.firstName, user?.lastName]);

  const onOpenFollowers = useCallback(() => {
    setActiveConnectionsTab?.("followers");
    setConnectionsModalVisible?.(true);
  }, [setActiveConnectionsTab, setConnectionsModalVisible]);

  const onOpenFollowing = useCallback(() => {
    setActiveConnectionsTab?.("following");
    setConnectionsModalVisible?.(true);
  }, [setActiveConnectionsTab, setConnectionsModalVisible]);

  const onEditProfile = useCallback(() => {
    setEditModalVisible?.(true);
  }, [setEditModalVisible]);

  const onSettings = useCallback(() => {
    navigation.navigate("Settings");
  }, [navigation]);

  const onClearLog = useCallback(() => {
    dispatch(clearTodayEngagementLog());
  }, [dispatch]);

  return (
    <>
      <SelfProfileHeader
        bannerUrl={banner?.url}
        profilePicUrl={profilePic?.url}
        fullName={fullName}
        followersCount={followersCount}
        followingCount={followingCount}
        onOpenFollowers={onOpenFollowers}
        onOpenFollowing={onOpenFollowing}
        onEditProfile={onEditProfile}
        onSettings={onSettings}
        onClearLog={onClearLog}
      />
      <View style={[styles.divider, dividerStyle]} />
      <ProfileTabs active={activeSection} onChange={setActiveSection} />
    </>
  );
}

export default React.memo(ProfileChrome);

const styles = StyleSheet.create({
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "lightgray",
    marginVertical: 10,
  },
});
