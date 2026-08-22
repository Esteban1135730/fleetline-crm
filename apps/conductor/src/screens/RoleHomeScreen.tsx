import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { clearToken, homeTitleForRole, normalizeRole, type AuthUser } from "../api";

type Props = NativeStackScreenProps<RootStackParamList, "RoleHome"> & {
  user: AuthUser;
  onLogout: () => void;
};

export default function RoleHomeScreen({ navigation, user, onLogout }: Props) {
  const role = normalizeRole(user.role);

  async function logout() {
    await clearToken();
    onLogout();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>INRETRANS OS</Text>
      <Text style={styles.title}>{homeTitleForRole(role)}</Text>
      <Text style={styles.sub}>
        {user.name} · {role}
      </Text>

      {role === "conductor" ? (
        <Pressable
          style={styles.btn}
          onPress={() => navigation.replace("Trips")}
        >
          <Text style={styles.btnText}>Mis viajes / servicios</Text>
        </Pressable>
      ) : null}

      {role === "supervisor" || role === "despacho" ? (
        <Pressable
          style={styles.btn}
          onPress={() => navigation.replace("SupervisorHome")}
        >
          <Text style={styles.btnText}>Desviaciones y aprobación</Text>
        </Pressable>
      ) : null}

      {role === "monitora" || role === "padre" || role === "pasajero" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Módulo {role}</Text>
          <Text style={styles.cardBody}>
            Consola adaptada al rol. Usa chat de soporte para incidencias de la
            app; el tracking escolar/pasajero se enlaza vía API /escolar y
            /pasajeros.
          </Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.btn, styles.secondary]}
        onPress={() => navigation.navigate("SupportChat")}
      >
        <Text style={styles.btnText}>Chat soporte general</Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.secondary]}
        onPress={() => navigation.navigate("Profile")}
      >
        <Text style={styles.btnText}>Mi perfil</Text>
      </Pressable>

      <Pressable style={styles.logout} onPress={() => void logout()}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0D14",
    padding: 24,
    justifyContent: "center",
  },
  brand: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: { color: "#F8FAFC", fontSize: 26, fontWeight: "700" },
  sub: { color: "#94A3B8", marginTop: 6, marginBottom: 28 },
  btn: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  secondary: { backgroundColor: "#0D9488" },
  btnText: { color: "#04110c", fontWeight: "800", textAlign: "center" },
  card: {
    backgroundColor: "#121722",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  cardTitle: { color: "#F8FAFC", fontWeight: "700", marginBottom: 6 },
  cardBody: { color: "#94A3B8", lineHeight: 20 },
  logout: { marginTop: 24, alignItems: "center" },
  logoutText: { color: "#64748B", fontWeight: "600" },
});
