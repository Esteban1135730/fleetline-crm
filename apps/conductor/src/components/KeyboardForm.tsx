import type { ReactNode } from "react";
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardLift } from "./useKeyboardLift";

export function KeyboardForm({
  children,
  center,
  style,
  contentStyle,
}: {
  children: ReactNode;
  center?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const lift = useKeyboardLift();
  const insets = useSafeAreaInsets();
  const keyboardOpen = lift > 0;

  return (
    <ScrollView
      style={[styles.scroll, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={[
        styles.content,
        {
          justifyContent: center && !keyboardOpen ? "center" : "flex-start",
          paddingTop: keyboardOpen ? 12 : 0,
          paddingBottom: lift + insets.bottom + 24,
        },
        contentStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#050B14" },
  content: { flexGrow: 1 },
});
