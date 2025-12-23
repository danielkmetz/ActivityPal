import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

function dollars(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return "$".repeat(Math.min(4, Math.max(1, Math.round(v))));
}

export default function ReviewMetaRow({ post }) {
  const postContent = post?.original ?? post ?? {};
  const details = postContent?.details || {};
  const rating = details?.rating;
  const priceRating = details?.priceRating;
  const wouldGoBack = details?.wouldGoBack;
  const vibeTags = Array.isArray(details?.vibeTags) ? details.vibeTags : [];
  const safeRating = Number.isFinite(rating)
    ? Math.min(5, Math.max(0, Math.floor(rating)))
    : 0;

  const price = useMemo(() => dollars(priceRating), [priceRating]);
  const shownTags = vibeTags.slice(0, 3);
  const extraCount = Math.max(0, vibeTags.length - shownTags.length);

  return (
    <View style={styles.row}>
      <View style={styles.stars}>
        {Array.from({ length: safeRating }).map((_, i) => (
          <MaterialCommunityIcons key={i} name="star" size={18} color="gold" />
        ))}
      </View>
      {price ? <Text style={styles.price}>{price}</Text> : null}
      {typeof wouldGoBack === "string" ? (
        <View style={[styles.badge, wouldGoBack ? styles.badgeYes : styles.badgeNo]}>
          <Text style={styles.badgeText}>
            {wouldGoBack ? "Would go back" : "Wouldn’t go back"}
          </Text>
        </View>
      ) : null}
      <View style={styles.tags}>
        {shownTags.map((t) => (
          <View key={t} style={styles.tag}>
            <Text style={styles.tagText}>{t}</Text>
          </View>
        ))}
        {extraCount > 0 ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>+{extraCount}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 },
  stars: { flexDirection: "row" },
  price: { fontSize: 13, opacity: 0.8 },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 },
  badgeYes: { backgroundColor: "#d6f5d6" },
  badgeNo: { backgroundColor: "#f5d6d6" },
  badgeText: { fontSize: 12 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: "#eee", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12 },
  tagText: { fontSize: 12, opacity: 0.85 },
});
