import React from "react";
import { View, Animated, Dimensions, StyleSheet } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

const PhotoPaginationDots = ({ photos, scrollX }) => {
    if (!photos || photos.length <= 1) {
        return <View style={styles.paginationContainer} />;
    }

    return (
        <View style={styles.paginationContainer}>
            {photos.map((_, index) => {
                let dotSize;

                if (photos.length === 2) {
                    dotSize = scrollX.interpolate({
                        inputRange: [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
                        outputRange: [8, 10, 8],
                        extrapolate: "clamp",
                    });
                } else if (photos.length === 3) {
                    dotSize = scrollX.interpolate({
                        inputRange: [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
                        outputRange: [7, 10, 7],
                        extrapolate: "clamp",
                    });
                } else {
                    dotSize = scrollX.interpolate({
                        inputRange: [
                            (index - 3) * SCREEN_WIDTH, (index - 2) * SCREEN_WIDTH, (index - 1) * SCREEN_WIDTH,
                            index * SCREEN_WIDTH,
                            (index + 1) * SCREEN_WIDTH, (index + 2) * SCREEN_WIDTH, (index + 3) * SCREEN_WIDTH,
                        ],
                        outputRange: [5, 6.5, 8, 10, 8, 6.5, 5],
                        extrapolate: "clamp",
                    });
                }

                return (
                    <Animated.View
                        key={index}
                        style={[
                            styles.dot,
                            {
                                width: dotSize,
                                height: dotSize,
                                borderRadius: dotSize,
                            },
                        ]}
                    />
                );
            })}
        </View>
    );
};

export default PhotoPaginationDots;

const styles = StyleSheet.create({
    paginationContainer: {
        position: 'absolute',
        bottom: -15,
        flexDirection: 'row',
        justifyContent: 'center',
        alignSelf: 'center',
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ccc',
        marginHorizontal: 3,
        marginBottom: 10,
    },

});
