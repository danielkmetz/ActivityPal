import React, { useState } from "react";
import { Text, View, Dimensions, StyleSheet } from "react-native";

const screenWidth = Dimensions.get("window").width;

export default function ExpandableText({ post, maxLines = 2, textStyle = {}, seeMoreStyle = {} }) {
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const [truncatedHeight, setTruncatedHeight] = useState(0);
  const postContent = post?.original ? post?.original : post;
  const text = postContent?.reviewText || postContent?.message || postContent?.caption || postContent?.note;

  return (
    <View>
      {/* Hidden measurement */}
      <View style={{ position: 'absolute', opacity: 0, zIndex: -1 }}>
        <Text
          style={[styles.measurement, textStyle]}
          onLayout={(e) => setFullHeight(e.nativeEvent.layout.height)}
        >
          {text}
        </Text>
        <Text
          style={[styles.measurement, textStyle]}
          numberOfLines={maxLines}
          onLayout={(e) => setTruncatedHeight(e.nativeEvent.layout.height)}
        >
          {text}
        </Text>
      </View>

      {/* Visible truncated or expanded text */}
      <Text
        style={[textStyle, { width: screenWidth - 40 }]}
        numberOfLines={expanded ? undefined : maxLines}
      >
        {text}
      </Text>

      {/* Toggle button */}
      {fullHeight > truncatedHeight && (
        <Text
          style={[styles.seeMore, seeMoreStyle]}
          onPress={() => setExpanded(prev => !prev)}
        >
          {expanded ? "See less" : "...see more"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  measurement: {
    width: screenWidth - 40,
    lineHeight: 22,
  },
  seeMore: {
    color: "#007AFF",
    fontSize: 14,
    marginTop: 5,
  },
});
