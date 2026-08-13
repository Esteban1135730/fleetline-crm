import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { palette } from "../theme";

const c = palette("dark");

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Sub({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sub}>{children}</Text>;
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <Text style={styles.mono}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={c.subtext}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.btn,
        danger && { backgroundColor: c.critical },
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#0A0D14" />
      ) : (
        <Text style={styles.btnText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Skeleton({ height = 72 }: { height?: number }) {
  return <View style={[styles.skeleton, { height }]} />;
}

export function ToastBar({
  message,
  tone = "ok",
}: {
  message: string | null;
  tone?: "ok" | "err";
}) {
  if (!message) return null;
  return (
    <View
      style={[
        styles.toast,
        { backgroundColor: tone === "ok" ? c.brand : c.critical },
      ]}
    >
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.canvas,
    padding: 16,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    color: c.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  sub: {
    color: c.subtext,
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  mono: {
    color: c.amber,
    fontFamily: "monospace",
    fontSize: 15,
    fontWeight: "600",
  },
  label: {
    color: c.subtext,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: c.canvas,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    color: c.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 52,
  },
  btn: {
    backgroundColor: c.brand,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    minHeight: 56,
    justifyContent: "center",
  },
  btnText: {
    color: "#0A0D14",
    fontWeight: "800",
    fontSize: 16,
  },
  skeleton: {
    backgroundColor: c.surface,
    borderRadius: 12,
    marginBottom: 10,
    opacity: 0.7,
  },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 10,
    padding: 14,
    zIndex: 50,
  },
  toastText: {
    color: "#0A0D14",
    fontWeight: "700",
    textAlign: "center",
  },
});
