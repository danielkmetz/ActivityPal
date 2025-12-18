import React from "react";
import { View, Image, StyleSheet, FlatList, Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
const PHOTO_SIZE = SCREEN_WIDTH / 3; // Each photo is 1/3 of screen width

const Photos = ({ photos, ListHeaderComponent, ListFooterComponent }) => {  
  return (
    <FlatList
      data={photos}
      keyExtractor={(item) => item.url.split("?")[0]}
      numColumns={3} // ✅ Ensures 3 columns per row
      contentContainerStyle={styles.gridContainer}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}          
      renderItem={({ item }) => (
        <View style={styles.photoContainer}>
          <Image source={{ uri: item.url }} style={styles.photo} />
        </View>
      )}
    />
  );
};

export default Photos;

const styles = StyleSheet.create({
  gridContainer: {
    flexGrow: 1, // Ensures the list grows properly
    //justifyContent: "center",
    //alignItems: "center",
  },
  photoContainer: {
    width: PHOTO_SIZE, // ✅ Each photo spans 1/3 of the screen width
    height: PHOTO_SIZE, // ✅ Ensures a square aspect ratio
  },
  photo: {
    width: "100%",
    height: "100%",
    resizeMode: "cover", // ✅ Ensures images fill their space correctly
  },
});
