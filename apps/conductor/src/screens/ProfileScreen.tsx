import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { clearToken, type AuthUser } from "../api";

type Props = NativeStackScreenProps<RootStackParamList, "Profile"> & {
  user: AuthUser;
  onLogout: () => void;
};

export default function ProfileScreen({ navigation, user, onLogout }: Props) {
  async function logout() {
    Alert.alert("Cerrar sesión", "¿Salir de INRETRANS OS?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: async () => {
          await clearToken();
          onLogout();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user.name || "?").slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.role}>{user.role}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate("SupportChat")}
      >
        <Text style={styles.rowTitle}>Chat de soporte</Text>
        <Text style={styles.rowHint}>Tiempo real con torre</Text>
      </Pressable>

      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate("ChangePassword")}
      >
        <Text style={styles.rowTitle}>Cambiar contraseña</Text>
        <Text style={styles.rowHint}>Seguridad de cuenta</Text>
      </Pressable>

      <Pressable style={[styles.row, styles.danger]} onPress={() => void logout()}>
        <Text style={styles.dangerText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0D14", padding: 16, gap: 12 },
  card: {
    backgroundColor: "#121722",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#0A0D14",
    borderWidth: 1,
    borderColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: { color: "#10B981", fontWeight: "800", fontSize: 18 },
  name: { color: "#F8FAFC", fontSize: 20, fontWeight: "700" },
  role: {
    color: "#FFB800",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 6,
  },
  email: { color: "#94A3B8", fontSize: 13, marginTop: 6 },
  row: {
    backgroundColor: "#121722",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  rowTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "700" },
  rowHint: { color: "#64748B", fontSize: 12, marginTop: 4 },
  danger: { borderColor: "rgba(255,42,95,0.35)", marginTop: 8 },
  dangerText: {
    color: "#FF2A5F",
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
  },
});
