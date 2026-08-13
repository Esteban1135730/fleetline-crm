import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { useAuth } from "../../auth/AuthContext";
import { roleLabel } from "../../auth/roles";
import { fetchMyTrips, updateVehicleGps } from "../../api/endpoints";
import { useGpsTracking } from "../../gps/useGps";
import { SyncBanner } from "../../offline/SyncBanner";
import {
  Card,
  Mono,
  PrimaryButton,
  Skeleton,
  Sub,
  Title,
} from "../../components/ui";
import type { Trip } from "../../types";
import { palette } from "../../theme";

type Props = NativeStackScreenProps<RootStackParamList, "ConductorHome">;

export default function ConductorHome({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const c = palette("dark");

  const active = trips.find((t) =>
    ["IN_PROGRESS", "DISPATCHED", "ASSIGNED", "PLANNED"].includes(
      String(t.status).toUpperCase(),
    ),
  );

  useGpsTracking({
    enabled: !!active?.vehicleId,
    intervalMs: 45_000,
    onPoint: (p) => {
      if (!active?.vehicleId) return;
      void updateVehicleGps(active.vehicleId, p.lat, p.lng).catch(() => {
        /* offline: ignore ping */
      });
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMyTrips();
      setTrips(data.trips);
    } catch (err) {
      Alert.alert(
        "Uplink",
        err instanceof Error ? err.message : "No se pudieron cargar viajes",
      );
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
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <SyncBanner />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} />
        }
      >
        <Title>Operación en vía</Title>
        <Sub>
          {user?.name} · {roleLabel(user?.role ?? "")}
        </Sub>

        <Card>
          <Text style={{ color: "#FFB800", fontWeight: "700", marginBottom: 4 }}>
            PESV · control de fatiga
          </Text>
          <Text style={{ color: "#94A3B8", fontSize: 13, lineHeight: 18 }}>
            Máx. 10 h conducción / 24 h · descanso obligatorio ≥ 30 min cada 5 h.
            Si el score de fatiga es alto, no inicie servicio sin autorización.
          </Text>
        </Card>

        <PrimaryButton
          label="Preoperacional"
          onPress={() => {
            const trip = trips[0];
            if (!trip) {
              Alert.alert("Sin viaje", "No hay viaje asignado.");
              return;
            }
            navigation.navigate("Preoperational", { trip });
          }}
        />
        <PrimaryButton
          label="Registrar novedad"
          onPress={() => {
            const trip = active ?? trips[0];
            if (!trip) {
              Alert.alert("Sin viaje", "Seleccione un viaje.");
              return;
            }
            navigation.navigate("Incident", { trip });
          }}
        />
        <PrimaryButton
          label="Entrega / POD"
          onPress={() => {
            const trip = active ?? trips[0];
            if (!trip) return;
            navigation.navigate("Pod", { trip });
          }}
        />

        <Text style={styles.section}>Viajes asignados</Text>
        {loading && !trips.length ? (
          <>
            <Skeleton />
            <Skeleton />
          </>
        ) : (
          trips.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => navigation.navigate("TripDetail", { trip: t })}
            >
              <Card>
                <Mono>{t.code}</Mono>
                <Text style={styles.route}>
                  {t.origin} → {t.destination}
                </Text>
                <Text style={styles.status}>
                  {t.status}
                  {t.vehicle?.plate ? ` · ${t.vehicle.plate}` : ""}
                </Text>
              </Card>
            </Pressable>
          ))
        )}

        <PrimaryButton
          label="Cerrar sesión"
          danger
          onPress={() => void logout()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    color: "#94A3B8",
    marginTop: 20,
    marginBottom: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    fontSize: 12,
  },
  route: { color: "#F8FAFC", marginTop: 6, fontSize: 15 },
  status: { color: "#94A3B8", marginTop: 4, fontFamily: "monospace" },
});
