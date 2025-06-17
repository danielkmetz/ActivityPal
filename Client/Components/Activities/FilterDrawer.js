import React, { useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    TouchableWithoutFeedback,
    Modal,
} from 'react-native';
import Animated, {
    useSharedValue,
    withTiming,
    useAnimatedStyle,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import Notch from '../Notch/Notch';
import useSlideDownDismiss from '../../utils/useSlideDown';

const FilterDrawer = ({
    visible,
    allTypes,
    categoryFilter,
    onSelect,
    onClose,
}) => {
    const fadeAnim = useSharedValue(0);
    const { gesture, animateIn, animateOut, animatedStyle } = useSlideDownDismiss(onClose);

    useEffect(() => {
        fadeAnim.value = withTiming(visible ? 1 : 0, { duration: 100 });

        if (visible) {
            animateIn();
        } else {
            (async () => {
                await animateOut();
                onClose();
            })();
        }
    }, [visible]);

    const fadeStyle = useAnimatedStyle(() => ({
        opacity: fadeAnim.value,
    }));

    return (
        <Modal visible={visible} transparent onRequestClose={animateOut}>
            <TouchableWithoutFeedback onPress={animateOut}>
                <View style={[styles.drawerOverlay, fadeStyle]}>
                    <GestureDetector gesture={gesture}>
                        <Animated.View style={[styles.drawerContainer, animatedStyle]}>
                            <Notch />
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
                                                    animateOut();
                                                }}
                                            >
                                                <Text style={styles.drawerItemText}>
                                                    {item.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                    />
                                </View>
                            </TouchableWithoutFeedback>
                        </Animated.View>
                    </GestureDetector>
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
