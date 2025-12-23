import React, { memo } from "react";
import { Feather } from "@expo/vector-icons";
import HappeningBubble from "./HappeningBubble";

function CreatePlanBubble({ onPressCreatePlan, wrapperStyle }) {
  return (
    <HappeningBubble
      onPress={onPressCreatePlan}
      timeLabel="Plan"
      subLabel="something"
      bubbleStyle={{ backgroundColor: "#EEF2FF" }}
      wrapperStyle={wrapperStyle}
      fallback={<Feather name="plus" size={26} />}
    />
  );
}

export default memo(CreatePlanBubble);
