import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, Animated } from "react-native";
import { buildMapsUrl } from "../../utils/InviteDetails/buildMapsUrl";

export default function DirectionsBubble({
  address,
  businessName,
  placeId = null,
  bubbleTop = 26,
  bubbleLeft = 0,
}) {
  const canDirections = !!(address || businessName || placeId);
  const [showDirectionsHint, setShowDirectionsHint] = useState(false);
  const hintAnim = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef(null);

  const openDirections = useCallback(async () => {
    if (!canDirections) return;

    const url = buildMapsUrl({ address, placeId, label: businessName });

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        const fallbackQ = encodeURIComponent(address || businessName || "");
        await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${fallbackQ}`);
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      const fallbackQ = encodeURIComponent(address || businessName || "");
      try {
        await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${fallbackQ}`);
      } catch (_) {}
    }
  }, [address, placeId, businessName, canDirections]);

  const showHint = useCallback(() => {
    if (!canDirections) return;
    setShowDirectionsHint(true);
  }, [canDirections]);

  const hideHint = useCallback(() => {
    setShowDirectionsHint(false);
  }, []);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (showDirectionsHint) {
      hintAnim.setValue(0);
      Animated.timing(hintAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();

      hideTimerRef.current = setTimeout(() => {
        setShowDirectionsHint(false);
      }, 2200);
    } else {
      Animated.timing(hintAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showDirectionsHint, hintAnim]);

  const onPressHint = useCallback(async () => {
    hideHint();
    await openDirections();
  }, [hideHint, openDirections]);

  const onPressAddress = useCallback(() => {
    if (!canDirections) return;
    if (showDirectionsHint) {
      onPressHint();
      return;
    }
    showHint();
  }, [canDirections, showDirectionsHint, showHint, onPressHint]);

  const bubbleAnimStyle = {
    opacity: hintAnim,
    transform: [
      {
        translateY: hintAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 0],
        }),
      },
      {
        scale: hintAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };

  return (
    <View style={styles.addressWrap}>
      <TouchableOpacity onPress={onPressAddress} activeOpacity={0.7} disabled={!canDirections}>
        <Text style={styles.addressText} numberOfLines={2}>
          {address}
        </Text>
      </TouchableOpacity>
      {showDirectionsHint && (
        <Animated.View
          style={[
            styles.thoughtBubble,
            { top: bubbleTop, left: bubbleLeft },
            bubbleAnimStyle,
          ]}
        >
          <View style={styles.tailTriangle} />
          <TouchableOpacity onPress={onPressHint} activeOpacity={0.85}>
            <Text style={styles.thoughtText}>Get directions</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  addressWrap: {
    marginTop: 4,
    alignSelf: "flex-start",
    position: "relative",
  },
  addressText: {
    fontSize: 14,
    color: "#555",
  },
  thoughtBubble: {
    position: "absolute",
    zIndex: 999,
    elevation: 10,
    backgroundColor: "#111",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  thoughtText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  tailTriangle: {
    position: "absolute",
    top: -10,
    left: 16,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#111",
  },
});
