import React, { useRef } from 'react';
import { View, Image, Text, Animated, TouchableWithoutFeedback, Dimensions, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const screenWidth = Dimensions.get("window").width;

const PhotoItem = ({
    photo,
    reviewItem,
    likedAnimations,
    photoTapped,
    toggleTaggedUsers,
    handleLikeWithAnimation,
    lastTapRef,
}) => {
    const animation = likedAnimations[reviewItem._id] || new Animated.Value(0);

    const handleTap = () => {
        const now = Date.now();

        if (lastTapRef.current[reviewItem._id] && now - lastTapRef.current[reviewItem._id] < 300) {
            handleLikeWithAnimation(reviewItem.type, reviewItem._id);
            lastTapRef.current[reviewItem._id] = 0;
        } else {
            lastTapRef.current[reviewItem._id] = now;

            setTimeout(() => {
                if (lastTapRef.current[reviewItem._id] === now) {
                    toggleTaggedUsers(photo.photoKey);
                    lastTapRef.current[reviewItem._id] = 0;
                }
            }, 200);
        }
    };

    return (
        <View style={styles.photoContainer}>
            <TouchableWithoutFeedback onPress={handleTap}>
                <View>
                    <Image source={{ uri: photo.url }} style={styles.photo} />

                    <Animated.View style={[styles.likeOverlay, { opacity: animation }]}>
                        <MaterialCommunityIcons name="thumb-up" size={80} color="#80E6D2" />
                    </Animated.View>

                    {photoTapped === photo.photoKey &&
                        photo.taggedUsers?.map((taggedUser, index) => (
                            <View
                                key={index}
                                style={[
                                    styles.taggedLabel,
                                    { top: taggedUser.y, left: taggedUser.x },
                                ]}
                            >
                                <Text style={styles.tagText}>{taggedUser.fullName}</Text>
                            </View>
                        ))}
                </View>
            </TouchableWithoutFeedback>
        </View>
    );
};

const styles = StyleSheet.create({
    photo: {
        width: screenWidth, // Full width of review minus padding
        height: 400, // Larger photo height
        marginBottom: 15,
    },
    taggedLabel: {
        position: "absolute",
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
    },
    tagText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "bold",
    },
    likeOverlay: {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: [{ translateX: -40 }, { translateY: -40 }], // Center the thumbs-up
        opacity: 0, // Initially hidden
    },
    

})

export default PhotoItem;
