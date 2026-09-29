import { useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";

/**
 * Altura a reservar bajo el campo activo.
 * Si Android ya encogió la ventana (adjustResize), no suma de nuevo.
 */
export function useKeyboardLift() {
  const baseHeight = useRef(Dimensions.get("window").height);
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (e) => {
      const now = Dimensions.get("window").height;
      const resized = baseHeight.current - now > 80;
      setLift(resized ? 0 : Math.max(0, e.endCoordinates.height));
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setLift(0);
      baseHeight.current = Dimensions.get("window").height;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return lift;
}
