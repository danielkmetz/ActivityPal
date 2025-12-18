import React from "react";
import { View, Image, StyleSheet, Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
const PHOTO_SIZE = Math.floor(SCREEN_WIDTH / 3);

function PhotoGridRow({ row }) {
  const cells = Array.isArray(row) ? row : [];

  return (
    <View style={styles.row}>
      {[0, 1, 2].map((i) => {
        const url = cells[i]?.url;
        return (
          <View key={i} style={styles.cell}>
            {url ? (
              <Image source={{ uri: url }} style={styles.photo} fadeDuration={0} />
            ) : (
              <View style={styles.emptyCell} />
            )}
          </View>
        );
      })}
    </View>
  );
}

export default React.memo(PhotoGridRow);

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  cell: { width: PHOTO_SIZE, height: PHOTO_SIZE },
  photo: { width: "100%", height: "100%", resizeMode: "cover" },
  emptyCell: { width: "100%", height: "100%" },
});
