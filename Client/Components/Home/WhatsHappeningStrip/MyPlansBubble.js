import React, { memo, useCallback } from "react";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import HappeningBubble from "./HappeningBubble";

function MyPlansBubble({ imageUrl = null, badge = null, onPress = null }) {
  const navigation = useNavigation();

  const handlePress = useCallback(() => {
    if (typeof onPress === "function") return onPress();
    navigation.navigate("MyPlans");
  }, [navigation, onPress]);

  return (
    <HappeningBubble
      imageUrl={imageUrl}
      badge={badge}
      timeLabel="My plans"
      subLabel={"Past & upcoming"}
      onPress={handlePress}
      bubbleStyle={{ backgroundColor: "#DBEAFE" }}
      fallback={<Feather name="calendar" size={22} />}
    />
  );
}

export default memo(MyPlansBubble);
