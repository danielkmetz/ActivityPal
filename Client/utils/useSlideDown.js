import { useRef } from "react";
import { Animated, Dimensions } from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const DISMISS_THRESHOLD = 100;
const DISMISS_VELOCITY = 1000;

export default function useSlideDownDismiss(onClose) {
    const dragY = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    const gestureTranslateY = Animated.add(translateY, dragY).interpolate({
        inputRange: [-SCREEN_HEIGHT, 0, SCREEN_HEIGHT],
        outputRange: [0, 0, SCREEN_HEIGHT],
        extrapolate: 'clamp',
    });

    const animateIn = () => {
        translateY.setValue(SCREEN_HEIGHT);
        Animated.timing(translateY, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    };

    const animateOut = () => {
        return new Promise((resolve) => {
            Animated.timing(translateY, {
                toValue: SCREEN_HEIGHT,
                duration: 300,
                useNativeDriver: true,
            }).start(() => {
                onClose?.();
                resolve();
            });
        });
    };

    const onGestureEvent = Animated.event(
        [{ nativeEvent: { translationY: dragY } }],
        { useNativeDriver: true }
    );

    const onHandlerStateChange = async ({ nativeEvent }) => {
        const { state, translationY, velocityY } = nativeEvent;

        if (state === 5) {
            const shouldDismiss = translationY > DISMISS_THRESHOLD || velocityY > DISMISS_VELOCITY;

            if (shouldDismiss) {
                await animateOut();
            } else {
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                }).start();
            }

            dragY.setValue(0);
        }
    };

    return {
        gestureTranslateY,
        animateIn,
        animateOut,
        onGestureEvent,
        onHandlerStateChange,
    };
}
