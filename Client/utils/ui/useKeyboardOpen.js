import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/**
 * Tracks whether the keyboard is open.
 * Returns a boolean.
 */
export default function useKeyboardOpen() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));

    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, []);

  return keyboardOpen;
}
