import React from 'react';
import { StyleSheet } from 'react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function SwipeableRow({ children, onSwipe, notificationId }) {
    const navigation = useNavigation();

    const renderRightActions = () => (
        <RectButton style={styles.rightAction} onPress={() => onSwipe(notificationId)}>
            <MaterialCommunityIcons name="trash-can-outline" size={28} color="white" />
        </RectButton>
    );

    return (
        <Swipeable
            renderRightActions={renderRightActions}
            friction={2}
            overshootRight={false}
            simultaneousHandlers={navigation}
            activeOffsetX={[-15, 15]}
        >
            {children}
        </Swipeable>
    );
}

const styles = StyleSheet.create({
    rightAction: {
        backgroundColor: '#ff3b30',
        justifyContent: 'center',
        alignItems: 'center',
        width: 70,
        marginVertical: 5,
    },
});
