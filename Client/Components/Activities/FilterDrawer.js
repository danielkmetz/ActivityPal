import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    TouchableWithoutFeedback,
    Modal,
    Animated,
    Dimensions,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const FilterDrawer = ({
    visible,
    allTypes,
    categoryFilter,
    onSelect,
    onClose,
}) => {
    const translateY = useRef(new Animated.Value(0)).current;
    const drawerHeight = SCREEN_HEIGHT * 0.7;
    const gestureThreshold = 100;

    useEffect(() => {
        if (visible) {
            // Animate drawer in
            Animated.timing(translateY, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start();
        } else {
            translateY.setValue(drawerHeight);
        }
    }, [visible]);

    const handleClose = () => {
        Animated.timing(translateY, {
            toValue: drawerHeight,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            onClose(); // call onClose only after animation completes
        });
    };

    const onGestureEvent = Animated.event(
        [{ nativeEvent: { translationY: translateY } }],
        { useNativeDriver: true }
    );

    const onHandlerStateChange = ({ nativeEvent }) => {
        if (nativeEvent.state === State.END) {
            if (nativeEvent.translationY > gestureThreshold) {
                handleClose();
            } else {
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                }).start();
            }
        }
    };

    return (
        <Modal visible={visible} transparent animationType="none">
            <TouchableWithoutFeedback onPress={handleClose}>
                <View style={styles.drawerOverlay}>
                    <PanGestureHandler
                        onGestureEvent={onGestureEvent}
                        onHandlerStateChange={onHandlerStateChange}
                    >
                        <Animated.View
                            style={[
                                styles.drawerContainer,
                                {
                                    transform: [
                                        {
                                            translateY: translateY.interpolate({
                                                inputRange: [0, drawerHeight],
                                                outputRange: [0, drawerHeight],
                                                extrapolate: 'clamp',
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            <TouchableWithoutFeedback>
                                <View>
                                    <Text style={styles.drawerTitle}>Filter Categories</Text>
                                    <FlatList
                                        data={allTypes}
                                        keyExtractor={(item) => item}
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                style={[
                                                    styles.drawerItem,
                                                    item === categoryFilter && styles.drawerItemActive,
                                                ]}
                                                onPress={() => {
                                                    onSelect(item === categoryFilter ? null : item);
                                                    handleClose();
                                                }}
                                            >
                                                <Text style={styles.drawerItemText}>
                                                    {item.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    />
                                    <TouchableOpacity
                                        style={styles.drawerCloseButton}
                                        onPress={handleClose}
                                    >
                                        <Text style={styles.drawerCloseText}>Close</Text>
                                    </TouchableOpacity>
                                </View>
                            </TouchableWithoutFeedback>
                        </Animated.View>
                    </PanGestureHandler>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

export default FilterDrawer;

const styles = StyleSheet.create({
    drawerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },
    drawerContainer: {
        backgroundColor: 'white',
        padding: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '70%',
    },
    drawerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    drawerItem: {
        paddingVertical: 12,
    },
    drawerItemActive: {
        backgroundColor: '#e0f0ff',
        borderRadius: 10,
    },
    drawerItemText: {
        fontSize: 16,
    },
    drawerCloseButton: {
        marginTop: 20,
        alignSelf: 'center',
        padding: 10,
    },
    drawerCloseText: {
        color: '#2196F3',
        fontWeight: 'bold',
    },
});
