import React, { memo, useCallback } from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";

function PredictionRow({ item, onSelect }) {
  const main = item?.structured_formatting?.main_text || item?.description || "";
  const secondary = item?.structured_formatting?.secondary_text || "";

  const handlePress = useCallback(() => {
    onSelect?.(item);
  }, [onSelect, item]);

  return (
    <TouchableOpacity style={styles.row} onPress={handlePress}>
      <Text style={styles.mainText} numberOfLines={1}>
        {main}
      </Text>
      {!!secondary && (
        <Text style={styles.secondaryText} numberOfLines={1}>
          {secondary}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// Memo with a comparator that won’t break if `item` object identity changes
export default memo(
  PredictionRow,
  (prev, next) =>
    prev.onSelect === next.onSelect &&
    (prev.item?.place_id || "") === (next.item?.place_id || "")
);

const styles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f1f1",
  },
  mainText: { fontSize: 15 },
  secondaryText: { fontSize: 13, opacity: 0.6, marginTop: 2 },
});
