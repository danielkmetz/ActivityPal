// utils/usePanToCloseGesture.js
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, withSpring } from 'react-native-reanimated';

export default function usePanToCloseGesture(dragY, handleClose, threshold = 100) {
  return Gesture.Pan()
    .onUpdate((e) => {
      dragY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > threshold) {
        runOnJS(handleClose)();
      } else {
        dragY.value = withSpring(0);
      }
    });
}
