import React, { useState, useEffect } from "react";
import { Modal, View, Text, StyleSheet, KeyboardAvoidingView, TouchableOpacity, TouchableWithoutFeedback, FlatList, Image } from "react-native";
import profilePicPlaceholder from '../../assets/pics/profile-pic-placeholder.jpg';
import useSlideDownDismiss from "../../utils/useSlideDown";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import Notch from "../Notch/Notch";
import UserSearchList from "./UserSearchList";
import { useNavigation } from "@react-navigation/native";

export default function ConnectionsModal({ visible, initialTab, onClose, followers, following }) {
    const navigation = useNavigation();
    const [activeTab, setActiveTab] = useState(initialTab || "followers");
    const data = activeTab === "followers" ? followers : following;
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

    useEffect(() => {
        if (visible) {
            animateIn();            // Animate it in
        } else {
            // Animate it out and hide the modal
            (async () => {
                await animateOut();
                onClose();
            })();
        }
    }, [visible]);

    useEffect(() => {
        setActiveTab(initialTab || "followers");
    }, [initialTab, visible]);

    const navigateToOtherUserProfile = (userId) => {
        navigation.navigate('OtherUserProfile', { userId }); // Pass user data to the new screen
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView
                                behavior="padding"
                                style={styles.keyboardAvoiding}
                              >
                    <GestureDetector gesture={gesture}>
                        <Animated.View style={[styles.modalContainer, animatedStyle]}>
                            <Notch />
                            <View style={styles.header}>
                                <View style={styles.tabRow}>
                                    <TouchableOpacity onPress={() => setActiveTab("followers")} style={styles.tab}>
                                        <Text style={[styles.tabText, activeTab === "followers" && styles.activeText]}>
                                            {followers.length} Followers
                                        </Text>
                                        {activeTab === "followers" && <View style={styles.underline} />}
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setActiveTab("following")} style={styles.tab}>
                                        <Text style={[styles.tabText, activeTab === "following" && styles.activeText]}>
                                            {following.length} Following
                                        </Text>
                                        {activeTab === "following" && <View style={styles.underline} />}
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <UserSearchList
                                users={activeTab === "followers" ? followers : following}
                                onUserPress={(userId) => {
                                    navigateToOtherUserProfile(userId);
                                }}
                            />
                        </Animated.View>
                    </GestureDetector>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    modalContainer: {
        maxHeight: "70%",
        backgroundColor: "white",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 15,
        paddingHorizontal: 20,
        flexGrow: 1,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    tabRow: {
        flexDirection: "row",
        gap: 20,
    },
    tab: {
        alignItems: "center",
    },
    tabText: {
        fontSize: 16,
        color: "#555",
        fontWeight: "600",
    },
    activeText: {
        color: "#000",
        fontWeight: "bold",
    },
    underline: {
        height: 2,
        backgroundColor: "#000",
        width: "100%",
        marginTop: 4,
        borderRadius: 2,
    },
    userRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: 0.5,
        borderColor: "#ccc",
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
    },
    username: {
        fontSize: 16,
    },
    keyboardAvoiding: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
      },
});
