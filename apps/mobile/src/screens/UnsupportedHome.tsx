import { Text } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { PrimaryButton, Screen, Sub, Title } from "../components/ui";

export default function UnsupportedHome() {
  const { user, logout } = useAuth();
  return (
    <Screen>
      <Title>Rol no móvil</Title>
      <Sub>
        La app Fleetline OS cubre Conductor, Mecánico, Patio y Coordinador de
        Campo. Rol actual: {user?.role ?? "—"}. Use el panel web para este
        perfil.
      </Sub>
      <Text style={{ color: "#94A3B8", marginBottom: 16 }}>{user?.email}</Text>
      <PrimaryButton label="Cerrar sesión" danger onPress={() => void logout()} />
    </Screen>
  );
}
