import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../auth/AuthContext";
import { campoDashboard } from "../../api/endpoints";
import { SyncBanner } from "../../offline/SyncBanner";
import {
  Card,
  PrimaryButton,
  Skeleton,
  Sub,
  Title,
} from "../../components/ui";

type Props = NativeStackScreenProps<RootStackParamList, "CampoHome">;

export default function CampoHome({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [dash, setDash] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await campoDashboard();
      setDash(JSON.stringify(data).slice(0, 320));
    } catch (err) {
      setDash(err instanceof Error ? err.message : "Sin uplink");
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
        <Title>Field Commander</Title>
        <Sub>{user?.name} · auditoría QHSE y abordajes</Sub>
        <PrimaryButton
          label="Auditoría de campo"
          onPress={() => navigation.navigate("FieldAudit")}
        />
        <PrimaryButton
          label="Abordaje manual (offline)"
          onPress={() => navigation.navigate("Boarding")}
        />
        <Card>
          <Text style={{ color: "#94A3B8", marginBottom: 6 }}>Dashboard</Text>
          {loading ? (
            <Skeleton height={56} />
          ) : (
            <Text
              style={{ color: "#F8FAFC", fontFamily: "monospace", fontSize: 11 }}
            >
              {dash || "—"}
            </Text>
          )}
        </Card>
        <PrimaryButton label="Cerrar sesión" danger onPress={() => void logout()} />
      </ScrollView>
    </View>
  );
}
