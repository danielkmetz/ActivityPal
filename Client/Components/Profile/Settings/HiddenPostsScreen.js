import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SectionList,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { selectUser } from "../../../Slices/UserSlice";
import {
  selectHiddenPosts as selectTaggedHiddenPosts,
  selectHiddenPostsStatus as selectTaggedHiddenStatus,
  fetchHiddenTaggedPosts,
} from "../../../Slices/TaggedPostsSlice";
import {
  fetchHiddenPostsAll,
  selectHiddenListItems as selectGlobalHiddenItems,
  selectHiddenListStatus as selectGlobalHiddenStatus,
} from "../../../Slices/HiddenPostsSlice";
import { normalizePostType } from "../../../utils/normalizePostType";
import ReviewItem from "../../Reviews/ReviewItem";
import CheckInItem from "../../Reviews/CheckInItem";
import SharedPostItem from "../../Reviews/SharedPosts/SharedPostItem";
import InviteCard from "../../Reviews/InviteCard";

export default function HiddenPostsScreen() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const userId = user?.id;
  const [showTagged, setShowTagged] = useState(true);
  const [showGlobal, setShowGlobal] = useState(true);
  const taggedHidden = useSelector(selectTaggedHiddenPosts);
  const taggedStatus = useSelector(selectTaggedHiddenStatus);
  const globalHiddenItems = useSelector(selectGlobalHiddenItems);
  const globalStatus = useSelector(selectGlobalHiddenStatus);

  useEffect(() => {
    if (!userId) return;
    dispatch(fetchHiddenTaggedPosts());
    dispatch(fetchHiddenPostsAll({ include: "docs" }));
  }, [userId, dispatch]);

  const mappedTagged = useMemo(
    () =>
      (taggedHidden || []).map((h) => {
        const p = h.post || {};
        return {
          ...p,
          type: normalizePostType(p.type),
          __hidden: true,
          __hiddenMeta: {
            scope: "profile",
            hiddenId: h.hiddenId,
            targetId: h.targetId,
            targetRef: h.targetRef,
            hiddenCreatedAt: h.createdAt,
          },
        };
      }),
    [taggedHidden]
  );

  const mappedGlobal = useMemo(
    () =>
      (globalHiddenItems || []).map((h) => {
        const p = h.post || {};
        return {
          ...p,
          type: normalizePostType(p.type),
          __hidden: true,
          __hiddenMeta: {
            scope: "global",
            hiddenId: h.hiddenId,
            targetId: h.targetId,
            targetRef: h.targetRef,
            hiddenCreatedAt: h.createdAt,
          },
        };
      }),
    [globalHiddenItems]
  );

  const feedTagged = useMemo(
    () =>
      [...mappedTagged].sort(
        (a, b) =>
          new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)
      ),
    [mappedTagged]
  );

  const feedGlobal = useMemo(
    () =>
      [...mappedGlobal].sort(
        (a, b) =>
          new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)
      ),
    [mappedGlobal]
  );

  const renderPostRow = useCallback((item) => {
    const t = normalizePostType(item?.type);
    // Render a single card component (no lists)
    if (t === "review") return <ReviewItem key={String(item._id || item.id)} item={item} />;
    if (t === "check-in") return <CheckInItem key={String(item._id || item.id)} item={item} />;
    if (t === "sharedpost") return <SharedPostItem key={String(item._id || item.id)} item={item} />;
    if (t === "invite") return <InviteCard key={String(item._id || item.id)} invite={item} />;
    return (
      <View key={String(item._id || item.id)} style={{ padding: 12 }}>
        <Text style={{ fontWeight: "600" }}>Unsupported post type</Text>
        <Text style={{ color: "#666" }}>{t || "(unknown)"}</Text>
      </View>
    );
  }, []);

  const sections = useMemo(() => {
    const profData =
      showTagged
        ? (feedTagged.length ? feedTagged : [{ __empty: "profile" }])
        : [{ __collapsed: "profile" }];

    const globData =
      showGlobal
        ? (feedGlobal.length ? feedGlobal : [{ __empty: "global" }])
        : [{ __collapsed: "global" }];

    return [
      { key: "profile", title: "Posts hidden from profile", data: profData },
      { key: "global", title: "Hidden posts", data: globData },
    ];
  }, [showTagged, showGlobal, feedTagged, feedGlobal]);

  const renderSectionHeader = ({ section }) => {
    const isProfile = section.key === "profile";
    const open = isProfile ? showTagged : showGlobal;
    const toggle = () => (isProfile ? setShowTagged((v) => !v) : setShowGlobal((v) => !v));

    return (
      <TouchableOpacity onPress={toggle} style={styles.sectionHeader} activeOpacity={0.8}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={22}
          color="#000"
        />
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item, section }) => {
    if (item?.__collapsed) return null;

    if (item?.__empty) {
      const isProfile = item.__empty === "profile";
      const loading =
        isProfile ? taggedStatus === "loading" : globalStatus === "loading";
      return loading ? (
        <View style={styles.centerRow}>
          <ActivityIndicator />
          <Text style={{ marginLeft: 10 }}>Loading…</Text>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="eye-off" size={28} color="#666" />
          <Text style={styles.emptyTitle}>
            {section.key === "profile" ? "No posts hidden from profile" : "No hidden posts"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {section.key === "profile"
              ? "Tagged posts you hide from your profile will appear here."
              : "Posts you hide will appear here so you can unhide them later."}
          </Text>
        </View>
      );
    }

    return <View style={styles.rowWrap}>{renderPostRow(item)}</View>;
  };

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, index) =>
        String(item?._id || item?.id || item?.hiddenId || item?.__empty || item?.__collapsed || index)
      }
      contentContainerStyle={styles.listContent}
      stickySectionHeadersEnabled={false}
      ItemSeparatorComponent={() => <View style={styles.itemSep} />}
      SectionSeparatorComponent={() => <View style={styles.divider} />}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      // Tunables
      initialNumToRender={8}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 85, paddingBottom: 24, backgroundColor: "#f5f5f5", marginTop: 55 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  sectionHeader: {
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  centerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12 },
  emptyState: { alignItems: "center", paddingVertical: 16, paddingHorizontal: 12 },
  emptyTitle: { marginTop: 6, fontWeight: "700" },
  emptySubtitle: { color: "#666", marginTop: 4, textAlign: "center" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#e6e6e6", marginVertical: 8 },
  itemSep: { height: 8 },
  rowWrap: { paddingHorizontal: 0 },
});
