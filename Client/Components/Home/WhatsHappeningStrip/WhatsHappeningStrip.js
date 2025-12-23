import React, { useRef, useMemo, useCallback } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import HappeningBubble from "./HappeningBubble";
import MyPlansBubble from "./MyPlansBubble";
import CreatePlanBubble from "./CreatePlanBubble";

export default function WhatsHappeningStrip({
  items = [],
  myPlansMeta,
  onPressItem,
  onPressCreatePlan,
  onSeenFriendsItems,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 60 }),
    []
  );

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (!onSeenFriendsItems) return;

    const list = Array.isArray(viewableItems) ? viewableItems : [];

    const seenFriendIds = list
      .map((v) => v && v.item)
      .filter((item) => item && item.type === "friends" && typeof item.id === "string")
      .map((item) => item.id);

    if (seenFriendIds.length > 0) {
      onSeenFriendsItems(seenFriendIds);
    }
  }).current;

  // If you still inject a `type: 'you'` item into items, strip it out here.
  // If not, delete this filter entirely.
  const otherItems = useMemo(
    () => safeItems.filter((it) => it && it.type !== "you"),
    [safeItems]
  );

  const renderHeader = useCallback(() => {
    const photoUrl = myPlansMeta?.imageUrl || null;
    const badge = myPlansMeta?.badge || null;
    return <MyPlansBubble imageUrl={photoUrl} badge={badge} />;
  }, [myPlansMeta]);

  const renderFooter = useCallback(() => {
    return (
      <CreatePlanBubble
        onPressCreatePlan={onPressCreatePlan}
        wrapperStyle={{ marginRight: 8 }}
      />
    );
  }, [onPressCreatePlan]);

  const renderItem = useCallback(
    ({ item }) => (
      <HappeningBubble
        imageUrl={item?.imageUrl || null}
        badge={item?.badge || null}
        timeLabel={item?.timeLabel || ""}
        subLabel={item?.mainLabel || ""}
        onPress={() => onPressItem && onPressItem(item)}
        fallback={<FontAwesome name="map-marker" size={24} />}
      />
    ),
    [onPressItem]
  );

  const keyExtractor = useCallback((item, index) => {
    const id = item && item.id;
    return typeof id === "string" && id.length ? id : `item-${index}`;
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>What’s happening</Text>
        </View>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={otherItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.listContent}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerRow: {
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});
