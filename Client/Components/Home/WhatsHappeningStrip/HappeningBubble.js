import React, { memo } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";

export const BUBBLE_SIZE = 68;

function HappeningBubble({
  imageUrl = null,
  badge = null,
  timeLabel = "",
  subLabel = "",
  onPress = null,
  fallback = null,
  bubbleStyle,
  wrapperStyle,
  imageStyle,
  timeLabelStyle,
  subLabelStyle,
  badgeStyle,
  badgeTextStyle,
  activeOpacity = 0.8,
  disabled = false,
  testID,
}) {
  const isPressable = typeof onPress === "function" && !disabled;

  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.wrapper, wrapperStyle, disabled ? styles.disabled : null]}
      onPress={isPressable ? onPress : null}
      activeOpacity={isPressable ? activeOpacity : 1}
    >
      <View style={[styles.bubble, bubbleStyle]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.image, imageStyle]}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.fallback}>{fallback}</View>
        )}
        {badge ? (
          <View style={[styles.badge, badgeStyle]}>
            <Text style={[styles.badgeText, badgeTextStyle]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.timeLabel, timeLabelStyle]} numberOfLines={1}>
        {timeLabel}
      </Text>
      <Text style={[styles.subLabel, subLabelStyle]} numberOfLines={2}>
        {subLabel}
      </Text>
    </TouchableOpacity>
  );
}

export default memo(HappeningBubble);

const styles = StyleSheet.create({
  wrapper: {
    width: BUBBLE_SIZE + 10,
    marginHorizontal: 4,
    alignItems: "center",
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    bottom: 2,
    alignSelf: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "#111",
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "600",
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  subLabel: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
  },
  disabled: {
    opacity: 0.55,
  },
});
