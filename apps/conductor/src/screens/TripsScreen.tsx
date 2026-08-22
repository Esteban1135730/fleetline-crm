import { useCallback, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
  finalizarServicio,
  getCurrentGps,
  getStoredUser,
  iniciarServicio,
  reportarIncidente,
  type Trip,
} from "../api";
import { useGps } from "../hooks/useGps";
import { TripRouteMap } from "../components/TripRouteMap";
import { scheduleTripLocalReminder } from "../notifications/push";

type Props = NativeStackScreenProps<RootStackParamList, "Trips"> & {
  onLogout: () => void;
};

const STATUS_ES: Record<string, string> = {
  PENDING: "Pendiente",
  ASSIGNED: "Asignado",
  IN_TRANSIT: "En ruta",
  PENDING_SUPERVISOR_APPROVAL: "Pendiente supervisor",
  COMPLETED: "Terminado",
  CANCELLED: "Cancelado",
  INCIDENT: "Novedad",
};

const INCIDENT_CATEGORIES = [
  { id: "TRAFFIC", label: "Tráfico denso" },
  { id: "MECHANICAL", label: "Falla mecánica menor" },
  { id: "WEATHER", label: "Lluvia / clima" },
  { id: "ROADBLOCK", label: "Bloqueo de vía" },
  { id: "RELIEF_REQUEST", label: "Relevo solicitado" },
  { id: "DELAY", label: "Retraso" },
  { id: "OTHER", label: "Otro" },
] as const;

export default function TripsScreen({ navigation, onLogout }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [incidentTrip, setIncidentTrip] = useState<Trip | null>(null);
  const [incidentNotes, setIncidentNotes] = useState("");
  const [incidentCategory, setIncidentCategory] =
    useState<(typeof INCIDENT_CATEGORIES)[number]["id"]>("TRAFFIC");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
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
      setLoadFailed(false);
      setDriverName(data.driver?.name ?? null);
      const list = data.trips ?? [];
      setTrips(list);
      for (const t of list) {
        if (
          t.departAt &&
          ["PENDING", "ASSIGNED"].includes(String(t.status).toUpperCase())
        ) {
          void scheduleTripLocalReminder({
            id: t.id,
            code: t.code,
            departAt: t.departAt,
            origin: t.origin,
          });
        }
      }
    } catch (err) {
      setLoadFailed(true);
      setDriverName(null);
      setTrips([]);
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

  async function handleStart(trip: Trip) {
    if (!trip.preoperationalAt) {
      navigation.navigate("Preoperational", { trip });
      return;
    }
    setActionId(trip.id);
    try {
      const gps = await getCurrentGps();
      const res = await iniciarServicio(trip.id, gps);
      if (res.status === "PENDIENTE_APROBACION_SUPERVISOR") {
        Alert.alert(
          "Pendiente supervisor",
          res.gate?.violations?.map((v) => v.detail).join("\n") ||
            "Fuera de tolerancia — esperando ACEPTAR/CANCELAR",
        );
      }
      await load(true);
    } catch (err) {
      Alert.alert(
        "No se pudo iniciar",
        err instanceof Error ? err.message : "Error",
      );
    } finally {
      setActionId(null);
    }
  }

  async function handleEnd(trip: Trip) {
    setActionId(trip.id);
    try {
      const gps = await getCurrentGps();
      const res = await finalizarServicio(trip.id, gps);
      if (res.status === "PENDIENTE_APROBACION_SUPERVISOR") {
        Alert.alert(
          "Cierre pendiente",
          res.gate?.violations?.map((v) => v.detail).join("\n") ||
            "Fuera de geofence/horario — supervisor debe autorizar",
        );
      }
      await load(true);
    } catch (err) {
      Alert.alert(
        "No se pudo cerrar",
        err instanceof Error ? err.message : "Error",
      );
    } finally {
      setActionId(null);
    }
  }

  async function submitIncident() {
    if (!incidentTrip) return;
    setActionId(incidentTrip.id);
    try {
      let gps: { lat?: number; lng?: number } = {};
      try {
        gps = await getCurrentGps();
      } catch {
        /* opcional */
      }
      await reportarIncidente(incidentTrip.id, {
        category: incidentCategory,
        notes: incidentNotes.trim() || undefined,
        lat: gps.lat,
        lng: gps.lng,
        photoUrl: photoUrl || undefined,
      });
      setIncidentTrip(null);
      setIncidentNotes("");
      setPhotoUrl(null);
      Alert.alert(
        "Incidente enviado",
        "El viaje y el GPS continúan sin bloqueo.",
      );
      await load(true);
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "No se pudo reportar",
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
    void getStoredUser().then((u) => {
      navigation.setOptions({
        title: u ? `Viajes · ${u.name.split(" ")[0]}` : "Mis viajes",
        headerRight: () => (
          <View style={{ flexDirection: "row", gap: 14, marginRight: 4 }}>
            <Pressable onPress={() => navigation.navigate("SupportChat")}>
              <Text style={{ color: "#10B981", fontWeight: "700" }}>Chat</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate("Profile")}>
              <Text style={{ color: "#F8FAFC", fontWeight: "600" }}>Perfil</Text>
            </Pressable>
          </View>
        ),
      });
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
      {loadFailed ? (
        <Text style={styles.warning}>
          Fallo de uplink. Desliza para reintentar.
        </Text>
      ) : driverName ? (
        <Text style={styles.driver}>Conductor: {driverName}</Text>
      ) : (
        <Text style={styles.warning}>
          Usuario no vinculado a conductor. Usa conductor@inretrans.com / Inretrans2026*.
        </Text>
      )}

      {inTransitTrip ? (
        <View style={styles.gpsBanner}>
          <Text style={styles.gpsText}>
            GPS activo · reloj servidor · {inTransitTrip.code}
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
                <Text style={styles.meta}>Placa {item.vehicle.plate}</Text>
              ) : null}

              <TripRouteMap
                origin={item.origin}
                destination={item.destination}
                originLat={item.originLat}
                originLng={item.originLng}
                destLat={item.destLat}
                destLng={item.destLng}
                polylineJson={item.suggestedPolyline}
              />

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
                          ? "Ver preop."
                          : "Inspección preop."}
                      </Text>
                    </Pressable>
                    {item.preoperationalAt ? (
                      <Pressable
                        style={[styles.btn, styles.btnPrimary]}
                        disabled={busy}
                        onPress={() => void handleStart(item)}
                      >
                        <Text style={styles.btnTextPrimary}>
                          {busy ? "…" : "INICIAR"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}

                {item.status === "IN_TRANSIT" ? (
                  <Pressable
                    style={[styles.btn, styles.btnSuccess]}
                    disabled={busy}
                    onPress={() => void handleEnd(item)}
                  >
                    <Text style={styles.btnTextPrimary}>
                      {busy ? "…" : "FINALIZAR"}
                    </Text>
                  </Pressable>
                ) : null}

                {item.status === "PENDING_SUPERVISOR_APPROVAL" ? (
                  <Text style={styles.preopPending}>
                    Esperando ACEPTAR/CANCELAR del supervisor
                  </Text>
                ) : null}

                {item.status !== "COMPLETED" && item.status !== "CANCELLED" ? (
                  <>
                    <Pressable
                      style={[styles.btn, styles.btnWarn]}
                      disabled={busy}
                      onPress={() => {
                        setIncidentTrip(item);
                        setIncidentNotes("");
                        setIncidentCategory("TRAFFIC");
                        setPhotoUrl(null);
                      }}
                    >
                      <Text style={styles.btnTextPrimary}>Incidente</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.btn, styles.btnGhost]}
                      onPress={() =>
                        navigation.navigate("TripChat", { tripId: item.id, code: item.code })
                      }
                    >
                      <Text style={styles.btnGhostText}>Chat viaje</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Modal visible={!!incidentTrip} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reportar incidente</Text>
            <Text style={styles.modalSub}>
              {incidentTrip?.code} — no detiene el viaje ni el GPS
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {INCIDENT_CATEGORIES.map((c) => (
                <Pressable
                  key={c.id}
                  style={[
                    styles.chip,
                    incidentCategory === c.id && styles.chipActive,
                  ]}
                  onPress={() => setIncidentCategory(c.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      incidentCategory === c.id && styles.chipTextActive,
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              value={incidentNotes}
              onChangeText={setIncidentNotes}
              placeholder="Detalle opcional…"
              placeholderTextColor="#64748B"
            />
            <Pressable
              style={[styles.btn, styles.btnGhost, { marginBottom: 12 }]}
              onPress={() => {
                void (async () => {
                  try {
                    const ImagePicker = await import("expo-image-picker");
                    const perm =
                      await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (!perm.granted) {
                      Alert.alert("Permiso", "Se requiere acceso a la galería.");
                      return;
                    }
                    const pick = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ["images"],
                      quality: 0.55,
                      base64: true,
                    });
                    if (pick.canceled || !pick.assets[0]) return;
                    const asset = pick.assets[0];
                    if (asset.base64) {
                      setPhotoUrl(
                        `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64.slice(0, 120_000)}`,
                      );
                    } else if (asset.uri) {
                      setPhotoUrl(asset.uri);
                    }
                  } catch (e) {
                    Alert.alert(
                      "Foto",
                      e instanceof Error
                        ? e.message
                        : "No se pudo abrir la galería",
                    );
                  }
                })();
              }}
            >
              <Text style={styles.btnGhostText}>
                {photoUrl ? "Foto lista · cambiar" : "Adjuntar foto (opcional)"}
              </Text>
            </Pressable>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setIncidentTrip(null)}
              >
                <Text style={styles.btnGhostText}>Cerrar</Text>
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
  meta: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 4,
    fontFamily: "monospace",
  },
  preopOk: {
    fontSize: 12,
    color: "#10B981",
    marginBottom: 4,
    fontWeight: "600",
  },
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
  chip: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 10,
  },
  chipActive: {
    backgroundColor: "rgba(16,185,129,0.2)",
    borderColor: "#10B981",
  },
  chipText: { color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#10B981" },
  textArea: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 15,
    marginBottom: 16,
    color: "#F8FAFC",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
});
