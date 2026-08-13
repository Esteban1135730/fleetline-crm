import { Text, View, StyleSheet } from "react-native";
import { useNetwork } from "./useNetwork";
import { palette } from "../theme";

export function SyncBanner() {
  const { online, pending, syncing } = useNetwork();
  const c = palette("dark");

  if (online && pending === 0 && !syncing) return null;

  const label = !online
    ? pending > 0
      ? `Modo Offline · ${pending} pendiente(s)`
      : "Modo Offline"
    : syncing
      ? `Sincronizando ${pending} pendiente(s)…`
      : `${pending} pendiente(s) en cola`;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: online ? c.amber : c.critical,
        },
      ]}
    >
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  text: {
    color: "#0A0D14",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
});
