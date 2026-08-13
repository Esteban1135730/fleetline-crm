import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../auth/AuthContext";
import { fetchMechanicOrders } from "../../api/endpoints";
import { SyncBanner } from "../../offline/SyncBanner";
import {
  Card,
  Mono,
  PrimaryButton,
  Skeleton,
  Sub,
  Title,
} from "../../components/ui";
import type { WorkOrder } from "../../types";

type Props = NativeStackScreenProps<RootStackParamList, "MechanicHome">;

function severityRank(s?: string | null) {
  const u = String(s ?? "").toUpperCase();
  if (u.includes("CRITICAL") || u === "ALTA") return 0;
  if (u.includes("PREVENTIVE") || u === "MEDIA") return 1;
  return 2;
}

function normalizeOrders(raw: WorkOrder[] | { orders: WorkOrder[] }): WorkOrder[] {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.orders)) return raw.orders;
  return [];
}

export default function MechanicHome({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchMechanicOrders();
      const list = normalizeOrders(raw).sort(
        (a, b) => severityRank(a.severity) - severityRank(b.severity),
      );
      setOrders(list);
    } catch (err) {
      Alert.alert("Taller", err instanceof Error ? err.message : "Error");
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
        <Title>Órdenes de trabajo</Title>
        <Sub>{user?.name} · prioridad Alta → Baja</Sub>
        {loading && !orders.length ? (
          <>
            <Skeleton />
            <Skeleton />
          </>
        ) : (
          orders.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => navigation.navigate("WorkOrderDetail", { order: o })}
            >
              <Card>
                <Mono>{o.code}</Mono>
                <Text style={{ color: "#F8FAFC", marginTop: 6 }}>
                  {o.description}
                </Text>
                <Text style={{ color: "#94A3B8", marginTop: 4 }}>
                  {o.severity ?? "ROUTINE"} · {o.status}
                  {o.vehicle?.plate ? ` · ${o.vehicle.plate}` : ""}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
        {!loading && !orders.length ? (
          <Sub>Sin OTs asignadas.</Sub>
        ) : null}
        <PrimaryButton label="Cerrar sesión" danger onPress={() => void logout()} />
      </ScrollView>
    </View>
  );
}
