import React, { useEffect } from "react";
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, Dimensions, TouchableWithoutFeedback } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import useSlideDownDismiss from "../../utils/useSlideDown";
import Notch from "../Notch/Notch";
import InviteActionButton from "../Reviews/Invites/InviteActionButton";
import DetailsModalBody from './DetailsModalBody';
import Hero from './Hero';

const { height: screenHeight } = Dimensions.get("window");

export default function SuggestionDetailsModal({
    visible,
    onClose,
    suggestion,
    existingInvite = null,
    onPressBusiness = null,
}) {
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);
    const details = suggestion?.details || {};
    const placeId = suggestion?.placeId || details?.placeId || null;

    useEffect(() => {
        if (visible) {
            animateIn();
        } else {
            (async () => {
                await animateOut();
            })();
        }
    }, [visible]);

    const handlePressBusiness = async () => {
        if (typeof onPressBusiness === "function") {
            await animateOut();
            onPressBusiness({ placeId, suggestion });
        }
    }

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} onRequestClose={animateOut}>
            <TouchableWithoutFeedback onPress={animateOut} >
                <View style={styles.overlay}>
                    <GestureDetector gesture={gesture}>
                        <Animated.View style={[styles.sheet, animatedStyle]}>
                            <TouchableWithoutFeedback onPress={() => { }}>
                                <View>
                                    <Notch />
                                    <ScrollView
                                        style={styles.body}
                                        contentContainerStyle={styles.scrollContent}
                                        showsVerticalScrollIndicator={false}
                                    >
                                        {/* Hero */}
                                        <Hero suggestion={suggestion} />
                                        {/* Everything below keeps your old body padding */}
                                        <DetailsModalBody
                                            onPressBusiness={handlePressBusiness}
                                            suggestion={suggestion}
                                        />
                                    </ScrollView>
                                    {/* Sticky CTA */}
                                    <View style={styles.actionSheet}>
                                        <InviteActionButton
                                            suggestion={suggestion}
                                            existingInvite={existingInvite}
                                            variant="row"
                                        />
                                        <Pressable onPress={animateOut} style={styles.cancelRow}>
                                            <Text style={styles.cancelRowText}>Close</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </TouchableWithoutFeedback>
                        </Animated.View>
                    </GestureDetector>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.40)",
    },
    sheet: {
        backgroundColor: "white",
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        maxHeight: Math.round(screenHeight * 0.86),
        overflow: "hidden",
        paddingVertical: 10
    },
    body: { flexGrow: 1 },
    scrollContent: {
        paddingTop: 0,
        paddingBottom: 16,
    },
    actionSheet: {
        backgroundColor: "rgba(255,255,255,0.98)",
        borderTopWidth: 1,
        borderTopColor: "rgba(0,0,0,0.08)",
        shadowColor: "#000",
        shadowOpacity: 0.10,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -6 },
        elevation: 18,
    },
    cancelRow: {
        height: 54,
        alignItems: "center",
        justifyContent: "center",
    },
    cancelRowText: {
        fontSize: 16,
        fontWeight: "900",
        color: "#007bff",
    },
});
