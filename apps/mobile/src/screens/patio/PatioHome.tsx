import { useCallback, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../auth/AuthContext";
import { roleLabel } from "../../auth/roles";
import { fetchYardApp } from "../../api/endpoints";
import { SyncBanner } from "../../offline/SyncBanner";
import {
  Card,
  PrimaryButton,
  Skeleton,
  Sub,
  Title,
} from "../../components/ui";

type Props = NativeStackScreenProps<RootStackParamList, "PatioHome">;

export default function PatioHome({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchYardApp();
      setSummary(JSON.stringify(data).slice(0, 280));
    } catch (err) {
      setSummary(err instanceof Error ? err.message : "Sin datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0D14" }}>
      <SyncBanner />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} />
        }
      >
        <Title>Smart Yard</Title>
        <Sub>
          {user?.name} · {roleLabel(user?.role ?? "")}
        </Sub>
        <PrimaryButton
          label="Entrada / Salida (placa · QR)"
          onPress={() => navigation.navigate("GateCheck")}
        />
        <PrimaryButton
          label="Inspección de estado"
          onPress={() => navigation.navigate("YardInspection")}
        />
        <Card>
          <Text style={{ color: "#94A3B8", marginBottom: 6 }}>Yard app</Text>
          {loading ? <Skeleton height={48} /> : (
            <Text style={{ color: "#F8FAFC", fontFamily: "monospace", fontSize: 11 }}>
              {summary || "—"}
            </Text>
          )}
        </Card>
        <PrimaryButton
          label="Cerrar sesión"
          danger
          onPress={() => {
            Alert.alert("Sesión", "¿Cerrar uplink?", [
              { text: "Cancelar", style: "cancel" },
              { text: "Salir", style: "destructive", onPress: () => void logout() },
            ]);
          }}
        />
      </ScrollView>
    </View>
  );
}
