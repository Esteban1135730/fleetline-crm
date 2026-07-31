import { useCallback, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
  clearToken,
  fetchMyTrips,
  reportIncident,
  updateTripStatus,
  type Trip,
} from "../api";
import { useGps } from "../hooks/useGps";

type Props = NativeStackScreenProps<RootStackParamList, "Trips"> & {
  onLogout: () => void;
};

const STATUS_ES: Record<string, string> = {
  PENDING: "Pendiente",
  ASSIGNED: "Asignado",
  IN_TRANSIT: "En ruta",
  COMPLETED: "Terminado",
  CANCELLED: "Cancelado",
  INCIDENT: "Novedad",
};

export default function TripsScreen({ navigation, onLogout }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incidentTrip, setIncidentTrip] = useState<Trip | null>(null);
  const [incidentNotes, setIncidentNotes] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const inTransitTrip = trips.find(
    (t) => t.status === "IN_TRANSIT" && !!t.preoperationalAt,
  );
  useGps(
    !!inTransitTrip,
    inTransitTrip?.vehicleId ?? inTransitTrip?.vehicle?.id,
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchMyTrips();
      setDriverName(data.driver?.name ?? null);
      setTrips(data.trips);
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "No se pudieron cargar los viajes",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  async function handleStatus(trip: Trip, status: string) {
    if (status === "IN_TRANSIT") {
      if (!trip.preoperationalAt) {
        navigation.navigate("Preoperational", { trip });
        return;
      }
    }
    setActionId(trip.id);
    try {
      await updateTripStatus(trip.id, status);
      await load(true);
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "No se pudo actualizar el viaje",
      );
    } finally {
      setActionId(null);
    }
  }

  async function submitIncident() {
    if (!incidentTrip || !incidentNotes.trim()) {
      Alert.alert("Novedad", "Escribe una descripción.");
      return;
    }
    setActionId(incidentTrip.id);
    try {
      await reportIncident(incidentTrip.id, incidentNotes.trim());
      setIncidentTrip(null);
      setIncidentNotes("");
      await load(true);
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "No se pudo reportar la novedad",
      );
    } finally {
      setActionId(null);
    }
  }

  async function handleLogout() {
    await clearToken();
    onLogout();
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => void handleLogout()} style={{ marginRight: 8 }}>
          <Text style={{ color: "#F8FAFC", fontWeight: "600" }}>Salir</Text>
        </Pressable>
      ),
    });
  }, [navigation, onLogout]);

  if (loading && trips.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {driverName ? (
        <Text style={styles.driver}>Conductor: {driverName}</Text>
      ) : (
        <Text style={styles.warning}>
          Tu usuario no está vinculado a un conductor. Contacta a despacho.
        </Text>
      )}

      {inTransitTrip ? (
        <View style={styles.gpsBanner}>
          <Text style={styles.gpsText}>
            GPS activo — uplink cada ~12s ({inTransitTrip.code})
          </Text>
        </View>
      ) : null}

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor="#10B981"
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No tienes viajes activos.</Text>
        }
        renderItem={({ item }) => {
          const busy = actionId === item.id;
          const statusLabel = STATUS_ES[item.status] ?? item.status;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.badge}>{statusLabel}</Text>
              </View>
              <Text style={styles.route}>
                {item.origin} → {item.destination}
              </Text>
              {item.vehicle?.plate ? (
                <Text style={styles.meta}>Vehículo: {item.vehicle.plate}</Text>
              ) : null}
              {item.preoperationalAt ? (
                <Text style={styles.preopOk}>Preoperacional OK</Text>
              ) : item.status === "ASSIGNED" || item.status === "PENDING" ? (
                <Text style={styles.preopPending}>
                  Requiere inspección preoperacional
                </Text>
              ) : null}

              <View style={styles.actions}>
                {item.status === "ASSIGNED" || item.status === "PENDING" ? (
                  <>
                    <Pressable
                      style={[styles.btn, styles.btnEmerald]}
                      disabled={busy}
                      onPress={() =>
                        navigation.navigate("Preoperational", { trip: item })
                      }
                    >
                      <Text style={styles.btnTextPrimary}>
                        {item.preoperationalAt
                          ? "Ver / iniciar ruta"
                          : "Inspección preop."}
                      </Text>
                    </Pressable>
                    {item.preoperationalAt ? (
                      <Pressable
                        style={[styles.btn, styles.btnPrimary]}
                        disabled={busy}
                        onPress={() => void handleStatus(item, "IN_TRANSIT")}
                      >
                        <Text style={styles.btnTextPrimary}>
                          {busy ? "…" : "INICIAR RUTA"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}

                {item.status === "IN_TRANSIT" ? (
                  <Pressable
                    style={[styles.btn, styles.btnSuccess]}
                    disabled={busy}
                    onPress={() => void handleStatus(item, "COMPLETED")}
                  >
                    <Text style={styles.btnTextPrimary}>
                      {busy ? "…" : "Cerrar"}
                    </Text>
                  </Pressable>
                ) : null}

                {item.status !== "INCIDENT" && item.status !== "COMPLETED" ? (
                  <Pressable
                    style={[styles.btn, styles.btnWarn]}
                    disabled={busy}
                    onPress={() => {
                      setIncidentTrip(item);
                      setIncidentNotes("");
                    }}
                  >
                    <Text style={styles.btnTextPrimary}>Novedad</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Modal visible={!!incidentTrip} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reportar novedad</Text>
            <Text style={styles.modalSub}>
              Viaje {incidentTrip?.code}: describe lo ocurrido.
            </Text>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={4}
              value={incidentNotes}
              onChangeText={setIncidentNotes}
              placeholder="Ej. tráfico, avería, retraso…"
              placeholderTextColor="#64748B"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setIncidentTrip(null)}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnWarn]}
                onPress={() => void submitIncident()}
              >
                <Text style={styles.btnTextPrimary}>Enviar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0D14" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  driver: {
    padding: 16,
    fontSize: 15,
    fontWeight: "600",
    color: "#F8FAFC",
  },
  warning: {
    padding: 16,
    fontSize: 14,
    color: "#FFB800",
    backgroundColor: "rgba(255,184,0,0.12)",
  },
  gpsBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    backgroundColor: "rgba(16,185,129,0.15)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  gpsText: { color: "#10B981", fontSize: 13, fontWeight: "600" },
  empty: {
    textAlign: "center",
    color: "#94A3B8",
    marginTop: 40,
    fontSize: 15,
  },
  card: {
    backgroundColor: "#121722",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  code: { fontSize: 17, fontWeight: "700", color: "#F8FAFC" },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10B981",
    backgroundColor: "rgba(16,185,129,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  route: { fontSize: 15, color: "#94A3B8", marginBottom: 6 },
  meta: { fontSize: 13, color: "#64748B", marginBottom: 4, fontFamily: "monospace" },
  preopOk: { fontSize: 12, color: "#10B981", marginBottom: 4, fontWeight: "600" },
  preopPending: { fontSize: 12, color: "#FFB800", marginBottom: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: "#0D9488" },
  btnEmerald: { backgroundColor: "#10B981" },
  btnSuccess: { backgroundColor: "#059669" },
  btnWarn: { backgroundColor: "#D97706" },
  btnGhost: { backgroundColor: "#1e293b" },
  btnTextPrimary: { color: "#F8FAFC", fontWeight: "700" },
  btnGhostText: { color: "#94A3B8", fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#121722",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#F8FAFC" },
  modalSub: { fontSize: 14, color: "#94A3B8", marginVertical: 10 },
  textArea: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 15,
    marginBottom: 16,
    color: "#F8FAFC",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
});
